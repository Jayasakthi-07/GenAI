import {
  type AbcXyz,
  type DeadStock,
  type ForecastInsights,
  type InsightsQuery,
  MOVEMENT_LABELS,
  type MovementInsights,
  type MovementType,
  type SupplierInsights,
  type Turnover,
  type Valuation,
} from '@stockroom/shared';
import { Prisma } from '#generated/prisma/client.ts';
import { sumForecasts } from '../analytics/forecasting';
import { deadAndSlow } from '../analytics/optimization';
import { median, round } from '../analytics/stats';
import type { Db } from '../db/client';
import type { AnalysisDataService } from './analysis-data.service';
import type { CatalogService } from './catalog.service';
import type { SupplierService } from './supplier.service';
import { getOrgSettings, isoDay, localDay } from './support';

const IN_TYPES = ['RECEIPT', 'RETURN', 'TRANSFER_IN'];
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Read-only aggregates for the Analytics pages. Every figure is computed here or in `analytics/`. */
export class InsightsService {
  constructor(
    private readonly prisma: Db,
    private readonly deps: {
      catalog: CatalogService;
      analysis: AnalysisDataService;
      suppliers: SupplierService;
    },
  ) {}

  private async today() {
    return localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
  }

  /** SQL filters for positions (alias v) joined to products (alias p). */
  private async filters(q: Pick<InsightsQuery, 'warehouseId' | 'categoryId'>, wh = 'v.warehouse_id') {
    const where: Prisma.Sql[] = [Prisma.sql`p.status = 'ACTIVE'`];
    if (q.warehouseId) where.push(Prisma.sql`${Prisma.raw(wh)} = ${q.warehouseId}::uuid`);
    if (q.categoryId) {
      const ids = await this.deps.catalog.categoryWithDescendants(q.categoryId);
      where.push(Prisma.sql`p.category_id = ANY(${ids}::uuid[])`);
    }
    return Prisma.join(where, ' AND ');
  }

  async valuation(q: InsightsQuery): Promise<Valuation> {
    const where = await this.filters(q);
    const [totals, byCategory, byWarehouse, top] = await Promise.all([
      this.prisma.$queryRaw<Array<{ value: number; units: number; positions: number; products: number }>>`
        SELECT COALESCE(SUM(v.value), 0)::float8 AS value, COALESCE(SUM(v.on_hand), 0)::int AS units,
               COUNT(*) FILTER (WHERE v.on_hand > 0)::int AS positions,
               COUNT(DISTINCT v.product_id) FILTER (WHERE v.on_hand > 0)::int AS products
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; value: number; units: number }>>`
        SELECT COALESCE(pc.id, c.id) AS id, COALESCE(pc.name, c.name) AS name,
               SUM(v.value)::float8 AS value, SUM(v.on_hand)::int AS units
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id
        JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
        WHERE ${where} GROUP BY 1, 2 ORDER BY value DESC`,
      this.prisma.$queryRaw<Array<{ id: string; code: string; name: string; value: number; units: number }>>`
        SELECT w.id, w.code, w.name, SUM(v.value)::float8 AS value, SUM(v.on_hand)::int AS units
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id JOIN warehouses w ON w.id = v.warehouse_id
        WHERE ${where} GROUP BY 1, 2, 3 ORDER BY value DESC`,
      this.prisma.$queryRaw<
        Array<{
          product_id: string;
          sku: string;
          name: string;
          code: string;
          on_hand: number;
          value: number;
          cover: number | null;
        }>
      >`
        SELECT v.product_id, p.sku, p.name, w.code, v.on_hand, v.value::float8 AS value, v.days_of_cover AS cover
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id JOIN warehouses w ON w.id = v.warehouse_id
        WHERE ${where} AND v.on_hand > 0 ORDER BY v.value DESC LIMIT 15`,
    ]);
    const today = await this.today();
    const trend = await this.prisma.$queryRaw<Array<{ date: Date; value: number }>>`
      SELECT date, SUM(total_value)::float8 AS value FROM inventory_snapshots
      WHERE date > ${today}::date - ${q.days}::int
        ${q.warehouseId ? Prisma.sql`AND warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty}
      GROUP BY date ORDER BY date`;
    const t = totals[0] ?? { value: 0, units: 0, positions: 0, products: 0 };
    const total = t.value || 1;
    return {
      totals: { value: round(t.value, 2), units: t.units, positions: t.positions, products: t.products },
      byCategory: byCategory.map((c) => ({
        categoryId: c.id,
        category: c.name,
        value: round(c.value, 2),
        units: c.units,
        share: round(c.value / total, 4),
      })),
      byWarehouse: byWarehouse.map((w) => ({
        warehouseId: w.id,
        code: w.code,
        name: w.name,
        value: round(w.value, 2),
        units: w.units,
        share: round(w.value / total, 4),
      })),
      trend: trend.map((r) => ({ date: isoDay(r.date) ?? '', value: Math.round(r.value) })),
      topItems: top.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        warehouse: r.code,
        onHand: r.on_hand,
        value: round(r.value, 2),
        daysOfCover: r.cover === null ? null : round(r.cover, 1),
      })),
    };
  }

  async movements(q: InsightsQuery): Promise<MovementInsights> {
    const where = await this.filters(q, 'm.warehouse_id');
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const today = await this.today();
    const since = addDays(today, -q.days);
    const range = Prisma.sql`m.occurred_at >= (${since}::date + 1)::timestamp AT TIME ZONE ${tz}`;
    const [byDay, byType, top] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; type: string; units: number }>>`
        SELECT (m.occurred_at AT TIME ZONE ${tz})::date AS day, m.type::text AS type, SUM(ABS(m.quantity))::int AS units
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE ${where} AND ${range} AND m.type <> 'OPENING_BALANCE'
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ type: string; count: number; units: number; value: number }>>`
        SELECT m.type::text AS type, COUNT(*)::int AS count, SUM(ABS(m.quantity))::int AS units,
               SUM(ABS(m.quantity) * m.unit_cost)::float8 AS value
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE ${where} AND ${range} AND m.type <> 'OPENING_BALANCE'
        GROUP BY 1 ORDER BY units DESC`,
      this.prisma.$queryRaw<
        Array<{ product_id: string; sku: string; name: string; units: number; value: number }>
      >`
        SELECT m.product_id, p.sku, p.name, SUM(-m.quantity)::int AS units, SUM(-m.quantity * m.unit_cost)::float8 AS value
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE ${where} AND ${range} AND m.type = 'SALE'
        GROUP BY 1, 2, 3 ORDER BY units DESC LIMIT 10`,
    ]);
    const days = new Map<string, MovementInsights['byDay'][number]>();
    for (let i = q.days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      days.set(d, { date: d, received: 0, sold: 0, transferred: 0, adjusted: 0, writtenOff: 0 });
    }
    for (const r of byDay) {
      const row = days.get(isoDay(r.day) ?? '');
      if (!row) continue;
      if (r.type === 'RECEIPT' || r.type === 'RETURN') row.received += r.units;
      else if (r.type === 'SALE' || r.type === 'ISSUE') row.sold += r.units;
      else if (r.type === 'TRANSFER_OUT') row.transferred += r.units;
      else if (r.type === 'WRITE_OFF') row.writtenOff += r.units;
      else if (r.type === 'ADJUSTMENT' || r.type === 'COUNT_CORRECTION') row.adjusted += r.units;
    }
    const inRows = byType.filter((t) => IN_TYPES.includes(t.type));
    const outRows = byType.filter(
      (t) => !IN_TYPES.includes(t.type) && t.type !== 'ADJUSTMENT' && t.type !== 'COUNT_CORRECTION',
    );
    return {
      totals: {
        inUnits: inRows.reduce((a, t) => a + t.units, 0),
        outUnits: outRows.reduce((a, t) => a + t.units, 0),
        inValue: round(
          inRows.reduce((a, t) => a + t.value, 0),
          2,
        ),
        outValue: round(
          outRows.reduce((a, t) => a + t.value, 0),
          2,
        ),
      },
      byDay: [...days.values()],
      byType: byType.map((t) => ({
        type: t.type,
        label: MOVEMENT_LABELS[t.type as MovementType] ?? t.type,
        count: t.count,
        units: t.units,
        value: round(t.value, 2),
      })),
      topOut: top.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        units: r.units,
        value: round(r.value, 2),
      })),
    };
  }

  async abcXyz(q: InsightsQuery): Promise<AbcXyz> {
    const where = await this.filters({ categoryId: q.categoryId }, 'NULL');
    const today = await this.today();
    const rows = await this.prisma.$queryRaw<
      Array<{ abc: string | null; xyz: string | null; products: number; value: number; revenue: number }>
    >`
      WITH st AS (
        SELECT v.product_id, SUM(v.value) AS value FROM v_stock_positions v
        ${q.warehouseId ? Prisma.sql`WHERE v.warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty}
        GROUP BY 1
      ), sl AS (
        SELECT s.product_id, SUM(s.revenue) AS revenue FROM sales_daily s
        WHERE s.date > ${today}::date - 365
          ${q.warehouseId ? Prisma.sql`AND s.warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty}
        GROUP BY 1
      )
      SELECT p.abc_class::text AS abc, p.xyz_class::text AS xyz, COUNT(*)::int AS products,
             COALESCE(SUM(st.value), 0)::float8 AS value, COALESCE(SUM(sl.revenue), 0)::float8 AS revenue
      FROM products p
      LEFT JOIN st ON st.product_id = p.id
      LEFT JOIN sl ON sl.product_id = p.id
      WHERE ${where}
      GROUP BY 1, 2`;
    const classified = await this.prisma.product.aggregate({ _max: { classifiedAt: true } });
    // Shares and totals are over classified products; the rest are counted separately.
    const inMatrix = rows.filter((r) => r.abc && r.xyz);
    const revenue = inMatrix.reduce((a, r) => a + r.revenue, 0) || 1;
    const cells: AbcXyz['cells'] = [];
    for (const abc of ['A', 'B', 'C'] as const)
      for (const xyz of ['X', 'Y', 'Z'] as const) {
        const r = rows.find((x) => x.abc === abc && x.xyz === xyz);
        cells.push({
          abc,
          xyz,
          products: r?.products ?? 0,
          stockValue: round(r?.value ?? 0, 2),
          revenue: round(r?.revenue ?? 0, 2),
          revenueShare: round((r?.revenue ?? 0) / revenue, 4),
        });
      }
    return {
      classifiedAt: classified._max.classifiedAt?.toISOString() ?? null,
      cells,
      unclassified: rows.filter((r) => !r.abc || !r.xyz).reduce((a, r) => a + r.products, 0),
      totals: {
        products: inMatrix.reduce((a, r) => a + r.products, 0),
        stockValue: round(
          inMatrix.reduce((a, r) => a + r.value, 0),
          2,
        ),
        revenue: round(
          inMatrix.reduce((a, r) => a + r.revenue, 0),
          2,
        ),
      },
    };
  }

  async turnover(q: InsightsQuery): Promise<Turnover> {
    const today = await this.today();
    const where = await this.filters(q, 's.warehouse_id');
    const whereV = await this.filters(q);
    const [cogsCat, valueCat, cogsWh, valueWh, snapshots] = await Promise.all([
      this.prisma.$queryRaw<Array<{ key: string; label: string; cogs: number }>>`
        SELECT COALESCE(pc.id, c.id)::text AS key, COALESCE(pc.name, c.name) AS label, SUM(s.cogs)::float8 AS cogs
        FROM sales_daily s JOIN products p ON p.id = s.product_id
        JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
        WHERE ${where} AND s.date > ${today}::date - ${q.days}::int GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ key: string; value: number }>>`
        SELECT COALESCE(pc.id, c.id)::text AS key, SUM(v.value)::float8 AS value
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id
        JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
        WHERE ${whereV} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ key: string; label: string; cogs: number }>>`
        SELECT w.id::text AS key, w.name AS label, SUM(s.cogs)::float8 AS cogs
        FROM sales_daily s JOIN products p ON p.id = s.product_id JOIN warehouses w ON w.id = s.warehouse_id
        WHERE ${where} AND s.date > ${today}::date - ${q.days}::int GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ key: string; value: number }>>`
        SELECT v.warehouse_id::text AS key, SUM(v.value)::float8 AS value
        FROM v_stock_positions v JOIN products p ON p.id = v.product_id WHERE ${whereV} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ avg: number | null }>>`
        SELECT AVG(day_value)::float8 AS avg FROM (
          SELECT date, SUM(total_value) AS day_value FROM inventory_snapshots
          WHERE date > ${today}::date - ${q.days}::int
            ${q.warehouseId ? Prisma.sql`AND warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty}
          GROUP BY date
        ) d`,
    ]);
    const row = (key: string, label: string, cogs: number, value: number) => {
      const perDay = cogs / q.days;
      return {
        key,
        label,
        cogs: round(cogs, 2),
        inventoryValue: round(value, 2),
        turnover: value > 0 ? round((cogs * (365 / q.days)) / value, 2) : null,
        daysOfInventory: perDay > 0 ? round(value / perDay, 1) : null,
      };
    };
    const catValue = new Map(valueCat.map((r) => [r.key, r.value]));
    const whValue = new Map(valueWh.map((r) => [r.key, r.value]));
    const totalCogs = cogsCat.reduce((a, r) => a + r.cogs, 0);
    // A category filter can't use warehouse-level snapshots; fall back to today's value.
    const avgValue = q.categoryId
      ? valueCat.reduce((a, r) => a + r.value, 0)
      : (snapshots[0]?.avg ?? valueWh.reduce((a, r) => a + r.value, 0));
    return {
      days: q.days,
      overall: row('all', 'All stock', totalCogs, avgValue),
      byCategory: cogsCat
        .map((r) => row(r.key, r.label, r.cogs, catValue.get(r.key) ?? 0))
        .sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1)),
      byWarehouse: cogsWh
        .map((r) => row(r.key, r.label, r.cogs, whValue.get(r.key) ?? 0))
        .sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1)),
    };
  }

  async forecast(q: InsightsQuery): Promise<ForecastInsights> {
    const ids = q.categoryId ? await this.deps.catalog.categoryWithDescendants(q.categoryId) : null;
    const rows = await this.prisma.forecast.findMany({
      where: {
        isLatest: true,
        warehouseId: null,
        product: { status: 'ACTIVE', ...(ids ? { categoryId: { in: ids } } : {}) },
      },
      select: {
        productId: true,
        method: true,
        demandPattern: true,
        wape: true,
        mape: true,
        avgDailyDemand: true,
        points: true,
        generatedAt: true,
        product: {
          select: {
            sku: true,
            name: true,
            category: { select: { name: true, parent: { select: { name: true } } } },
          },
        },
      },
    });
    const wapes = rows.flatMap((r) => (r.wape === null ? [] : [Number(r.wape)]));
    const mapes = rows.flatMap((r) => (r.mape === null ? [] : [Number(r.mape)]));
    const group = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
      const m = new Map<K, typeof rows>();
      for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
      return m;
    };
    const med = (list: typeof rows) => {
      const w = list.flatMap((r) => (r.wape === null ? [] : [Number(r.wape)]));
      return w.length ? round(median(w), 1) : null;
    };
    const buckets = [
      { label: 'Under 20 %', test: (w: number) => w < 20 },
      { label: '20–40 %', test: (w: number) => w >= 20 && w < 40 },
      { label: '40–60 %', test: (w: number) => w >= 40 && w < 60 },
      { label: '60 % or more', test: (w: number) => w >= 60 },
    ].map((b) => ({ label: b.label, products: wapes.filter(b.test).length }));

    // Actual units for the last 28 complete days, then the summed forecast from today for 28 days.
    const today = await this.today();
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const actual = await this.prisma.$queryRaw<Array<{ date: Date; units: number }>>`
      SELECT s.date, SUM(s.quantity)::int AS units FROM sales_daily s JOIN products p ON p.id = s.product_id
      WHERE s.date >= ${today}::date - 28 AND s.date < ${today}::date AND p.status = 'ACTIVE'
        ${ids ? Prisma.sql`AND p.category_id = ANY(${ids}::uuid[])` : Prisma.empty}
        ${q.warehouseId ? Prisma.sql`AND s.warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty}
      GROUP BY 1`;
    const actualBy = new Map(actual.map((a) => [isoDay(a.date) ?? '', a.units]));
    // A warehouse filter scales product forecasts by that warehouse's share of recent sales.
    let shares: Map<string, number> | null = null;
    if (q.warehouseId) {
      const s = await this.prisma.$queryRaw<Array<{ product_id: string; share: number }>>`
        SELECT product_id, (SUM(quantity) FILTER (WHERE warehouse_id = ${q.warehouseId}::uuid))::float8
                 / NULLIF(SUM(quantity), 0)::float8 AS share
        FROM sales_daily WHERE date >= ${today}::date - 56 AND date < ${today}::date GROUP BY 1`;
      shares = new Map(s.map((r) => [r.product_id, r.share ?? 0]));
    }
    // Point h of a forecast made on day G is for day G + h − 1 (its history ends the day before G);
    // forecasts made on earlier days are shifted so every product lines up on today.
    const horizon = sumForecasts(
      rows.map((r) => {
        const offset = Math.max(
          0,
          Math.round((Date.parse(today) - Date.parse(localDay(r.generatedAt, tz))) / 86_400_000),
        );
        const pts = (r.points as Array<{ yhat: number; lo80: number; hi80: number }> | null) ?? [];
        return { points: pts.slice(offset), weight: shares ? (shares.get(r.productId) ?? 0) : 1 };
      }),
      28,
    );
    const series: ForecastInsights['series'] = [];
    for (let i = 28; i >= 1; i--) {
      const d = addDays(today, -i);
      series.push({ date: d, actual: actualBy.get(d) ?? 0, forecast: null, low: null, high: null });
    }
    if (rows.length)
      horizon.forEach((h, i) =>
        series.push({
          date: addDays(today, i),
          actual: null,
          forecast: Math.round(h.yhat),
          low: Math.round(h.lo80),
          high: Math.round(h.hi80),
        }),
      );
    const generated = rows.reduce<Date | null>((a, r) => (!a || r.generatedAt > a ? r.generatedAt : a), null);
    return {
      generatedAt: generated?.toISOString() ?? null,
      products: rows.length,
      medianWape: wapes.length ? round(median(wapes), 1) : null,
      medianMape: mapes.length ? round(median(mapes), 1) : null,
      byMethod: [...group((r) => r.method)].map(([method, list]) => ({
        method,
        products: list.length,
        medianWape: med(list),
      })),
      byCategory: [...group((r) => r.product.category.parent?.name ?? r.product.category.name)]
        .map(([category, list]) => ({
          category,
          products: list.length,
          medianWape: med(list),
          forecastPerDay: round(
            list.reduce((a, r) => a + Number(r.avgDailyDemand), 0),
            1,
          ),
        }))
        .sort((a, b) => b.forecastPerDay - a.forecastPerDay),
      buckets,
      worst: rows
        .filter((r) => r.wape !== null && Number(r.avgDailyDemand) >= 1)
        .sort((a, b) => Number(b.wape) - Number(a.wape))
        .slice(0, 10)
        .map((r) => ({
          productId: r.productId,
          sku: r.product.sku,
          name: r.product.name,
          method: r.method,
          pattern: r.demandPattern,
          wape: r.wape === null ? null : Number(r.wape),
          avgDailyDemand: round(Number(r.avgDailyDemand), 2),
        })),
      series,
    };
  }

  async suppliers(): Promise<SupplierInsights> {
    const rows = await this.deps.suppliers.scoreComparison();
    return {
      suppliers: rows
        .map((r) => {
          const m = r.live?.metrics;
          return {
            supplierId: r.supplierId,
            code: r.code,
            name: r.name,
            score: r.live?.score ?? r.saved.score,
            risk: r.live?.riskLevel ?? r.saved.riskLevel,
            onTimeRate: m?.onTimeRate ?? null,
            fillRate: m?.fillRate ?? null,
            avgLeadTimeDays: m?.avgLeadTimeDays ?? null,
            leadTimeCv: m?.leadTimeCv ?? null,
            priceChange: m?.priceChange ?? null,
            rejectionRate: m?.rejectionRate ?? null,
            overdue: m?.overdue ?? 0,
            spend: round(m?.spend ?? 0, 2),
            orders: m?.orders ?? 0,
          };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    };
  }

  async deadStock(q: InsightsQuery): Promise<DeadStock> {
    const org = await getOrgSettings(this.prisma);
    const ids = q.categoryId ? new Set(await this.deps.catalog.categoryWithDescendants(q.categoryId)) : null;
    let lines = await this.deps.analysis.stockLines(org);
    if (q.warehouseId) lines = lines.filter((l) => l.warehouseId === q.warehouseId);
    if (ids) {
      const inCat = new Set(
        (
          await this.prisma.product.findMany({
            where: { categoryId: { in: [...ids] } },
            select: { id: true },
          })
        ).map((p) => p.id),
      );
      lines = lines.filter((l) => inCat.has(l.productId));
    }
    const found = deadAndSlow(lines, {
      deadDays: org.deadStockDays,
      slowCoverDays: org.overstockDays,
      minValue: 1000,
    });
    return {
      totals: {
        deadValue: round(
          found.filter((f) => f.kind === 'dead').reduce((a, f) => a + f.value, 0),
          2,
        ),
        slowValue: round(
          found.filter((f) => f.kind === 'slow').reduce((a, f) => a + f.value, 0),
          2,
        ),
        positions: found.length,
      },
      items: found.slice(0, 100).map((f) => ({
        kind: f.kind,
        productId: f.line.productId,
        sku: f.line.sku,
        name: f.line.name,
        warehouseId: f.line.warehouseId,
        warehouse: f.line.warehouseCode,
        onHand: f.line.onHand,
        value: f.value,
        daysSinceSale: f.line.daysSinceSale,
        coverDays: f.coverDays,
        sellingPrice: f.line.sellingPrice,
        costPrice: f.line.costPrice,
        suggestedPrice: f.markdownPrice,
      })),
    };
  }
}
