import type { PlanItemInput, SupplierOption } from '../analytics/replenishment';
import type { Db } from '../db/client';
import { getOrgSettings, localDay, type OrgSettings } from './support';

export interface DemandStat {
  mean: number;
  std: number;
  total: number;
}

const key = (productId: string, warehouseId: string) => `${productId}|${warehouseId}`;

/**
 * Loads the inputs the planning analyzers need in a few bulk queries. The maths lives in
 * `analytics/`; this service only reads.
 */
export class PlanningService {
  constructor(private readonly prisma: Db) {}

  /**
   * Maps what a model wrote (an id, a SKU, a warehouse or supplier code) to ids. Models copy short
   * codes far more reliably than UUIDs.
   */
  async resolve(kind: 'product' | 'warehouse' | 'supplier', refs: string[]): Promise<Map<string, string>> {
    const wanted = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
    if (!wanted.length) return new Map();
    const uuids = wanted.filter((r) => /^[0-9a-f-]{36}$/i.test(r));
    const codes = wanted.filter((r) => !uuids.includes(r));
    const insensitive = { in: codes, mode: 'insensitive' as const };
    // Codes first; exact names (case-insensitive) as a fallback, since models often write names.
    const rows: Array<{ id: string; code: string; name: string }> =
      kind === 'product'
        ? (
            await this.prisma.product.findMany({
              where: { OR: [{ id: { in: uuids } }, { sku: insensitive }, { name: insensitive }] },
              select: { id: true, sku: true, name: true },
            })
          ).map((p) => ({ id: p.id, code: p.sku, name: p.name }))
        : kind === 'warehouse'
          ? await this.prisma.warehouse.findMany({
              where: { OR: [{ id: { in: uuids } }, { code: insensitive }, { name: insensitive }] },
              select: { id: true, code: true, name: true },
            })
          : await this.prisma.supplier.findMany({
              where: { OR: [{ id: { in: uuids } }, { code: insensitive }, { name: insensitive }] },
              select: { id: true, code: true, name: true },
            });
    const out = new Map<string, string>();
    for (const ref of wanted) {
      const r = ref.toLowerCase();
      const hit =
        rows.find((x) => x.id === ref || x.code.toLowerCase() === r) ??
        rows.find((x) => x.name.toLowerCase() === r);
      if (hit) out.set(ref, hit.id);
    }
    return out;
  }

  org(): Promise<OrgSettings> {
    return getOrgSettings(this.prisma);
  }

  async today(): Promise<string> {
    return localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
  }

  /** Daily demand mean and spread per product × warehouse over the last `days` days (zero days included). */
  async demandStats(days = 56): Promise<Map<string, DemandStat>> {
    const today = await this.today();
    const rows = await this.prisma.$queryRaw<
      Array<{ product_id: string; warehouse_id: string; s: number; ss: number }>
    >`
      SELECT product_id, warehouse_id, SUM(quantity)::float8 AS s,
             SUM(quantity::float8 * quantity::float8) AS ss
      FROM sales_daily
      WHERE date > ${today}::date - ${days}::int
      GROUP BY 1, 2`;
    const out = new Map<string, DemandStat>();
    for (const r of rows) {
      const mean = r.s / days;
      const variance = Math.max(0, r.ss / days - mean * mean);
      out.set(key(r.product_id, r.warehouse_id), { mean, std: Math.sqrt(variance), total: r.s });
    }
    return out;
  }

  /** Latest forecasts, per warehouse where the forecaster made one, otherwise split by each warehouse's sales share. */
  private async forecastDemand(
    history: Map<string, DemandStat>,
  ): Promise<Map<string, { mean: number; std: number }>> {
    const rows = await this.prisma.forecast.findMany({
      where: { isLatest: true },
      select: { productId: true, warehouseId: true, avgDailyDemand: true, demandStdDev: true },
    });
    const totals = new Map<string, number>();
    for (const [k, v] of history) {
      const productId = k.split('|')[0] as string;
      totals.set(productId, (totals.get(productId) ?? 0) + v.total);
    }
    const out = new Map<string, { mean: number; std: number }>();
    const whole = new Map<string, { mean: number; std: number }>();
    for (const f of rows) {
      const v = { mean: Number(f.avgDailyDemand), std: Number(f.demandStdDev) };
      if (f.warehouseId) out.set(key(f.productId, f.warehouseId), v);
      else whole.set(f.productId, v);
    }
    for (const [k, h] of history) {
      if (out.has(k)) continue;
      const productId = k.split('|')[0] as string;
      const f = whole.get(productId);
      const total = totals.get(productId) ?? 0;
      if (!f || total <= 0) continue;
      const share = h.total / total;
      out.set(k, { mean: f.mean * share, std: f.std * Math.sqrt(share) });
    }
    return out;
  }

  async supplierOptions(productIds?: string[]): Promise<Map<string, SupplierOption[]>> {
    const links = await this.prisma.supplierProduct.findMany({
      where: productIds ? { productId: { in: productIds } } : undefined,
      include: {
        supplier: { select: { id: true, name: true, isActive: true, score: true } },
        product: { select: { preferredSupplierId: true } },
      },
    });
    const out = new Map<string, SupplierOption[]>();
    for (const l of links) {
      const option: SupplierOption = {
        supplierId: l.supplierId,
        supplierName: l.supplier.name,
        unitCost: Number(l.unitCost),
        moq: l.moq,
        packSize: l.packSize,
        leadTimeDays: l.leadTimeDays,
        score: l.supplier.score === null ? null : Number(l.supplier.score),
        isPreferred: l.product.preferredSupplierId === l.supplierId,
        isActive: l.isActive && l.supplier.isActive,
      };
      out.set(l.productId, [...(out.get(l.productId) ?? []), option]);
    }
    return out;
  }

  /** Every active product × active warehouse position, with demand and supplier options. */
  async replenishmentItems(): Promise<PlanItemInput[]> {
    const positions = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        sku: string;
        name: string;
        unit: string;
        warehouse_id: string;
        wh_code: string;
        available: number;
        on_order: number;
        reorder_point: number | null;
        max_stock: number | null;
        lead_time_days: number | null;
        cost: number;
      }>
    >`
      SELECT v.product_id, p.sku, p.name, u.code AS unit, v.warehouse_id, w.code AS wh_code,
             v.available, v.on_order, v.reorder_point, v.max_stock, p.lead_time_days,
             COALESCE(NULLIF(v.avg_cost, 0), p.cost_price)::float8 AS cost
      FROM v_stock_positions v
      JOIN products p ON p.id = v.product_id AND p.status = 'ACTIVE'
      JOIN units u ON u.id = p.unit_id
      JOIN warehouses w ON w.id = v.warehouse_id AND w.is_active`;
    const history = await this.demandStats(56);
    const forecast = await this.forecastDemand(history);
    const suppliers = await this.supplierOptions();
    return positions.map((r) => {
      const k = key(r.product_id, r.warehouse_id);
      const f = forecast.get(k);
      const h = history.get(k);
      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        warehouseId: r.warehouse_id,
        warehouseCode: r.wh_code,
        available: r.available,
        onOrder: r.on_order,
        reorderPoint: r.reorder_point,
        maxStock: r.max_stock,
        demandMean: f?.mean ?? h?.mean ?? 0,
        demandStd: f?.std ?? h?.std ?? 0,
        demandSource: f ? 'forecast' : 'history',
        leadTimeDays: r.lead_time_days ?? 7,
        unitCost: r.cost,
        suppliers: suppliers.get(r.product_id) ?? [],
      };
    });
  }
}
