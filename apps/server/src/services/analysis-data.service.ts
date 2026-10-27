import type { Adjustment, CostPoint, CountLine, DemandSeries, ReceiptLine } from '../analytics/anomalies';
import type { StockLine } from '../analytics/optimization';
import { computePolicy } from '../analytics/replenishment';
import type { Db } from '../db/client';
import { getOrgSettings, isoDay, localDay } from './support';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayRange = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

export interface ProductMeta {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  categoryId: string;
}

/**
 * Bulk reads for the analyzers (forecasting, anomalies, optimization). Each method is a handful of
 * queries regardless of catalog size; the maths happens in `analytics/`.
 */
export class AnalysisDataService {
  constructor(private readonly prisma: Db) {}

  async today(): Promise<string> {
    return localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
  }

  private async warehouseCodes(): Promise<Map<string, string>> {
    const rows = await this.prisma.warehouse.findMany({ select: { id: true, code: true } });
    return new Map(rows.map((w) => [w.id, w.code]));
  }

  async activeProducts(): Promise<ProductMeta[]> {
    const rows = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: { select: { code: true } },
        category: { select: { id: true, name: true, parent: { select: { name: true } } } },
      },
      orderBy: { sku: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit.code,
      category: r.category.parent ? r.category.parent.name : r.category.name,
      categoryId: r.category.id,
    }));
  }

  /**
   * Daily units per product across all warehouses, zero-filled, oldest first. Ends yesterday: today
   * is still in progress, and a half-day of sales would read as a drop in demand.
   */
  async productDemand(days: number): Promise<{ dates: string[]; series: Map<string, number[]> }> {
    const today = await this.today();
    const end = addDays(today, -1);
    const dates = dayRange(end, days);
    const index = new Map(dates.map((d, i) => [d, i]));
    const rows = await this.prisma.$queryRaw<Array<{ product_id: string; date: Date; q: number }>>`
      SELECT product_id, date, SUM(quantity)::int AS q FROM sales_daily
      WHERE date > ${end}::date - ${days}::int AND date <= ${end}::date
      GROUP BY 1, 2`;
    const series = new Map<string, number[]>();
    for (const r of rows) {
      const i = index.get(isoDay(r.date) ?? '');
      if (i === undefined) continue;
      let s = series.get(r.product_id);
      if (!s) series.set(r.product_id, (s = new Array<number>(days).fill(0)));
      s[i] = r.q;
    }
    return { dates, series };
  }

  /** Daily units per product × warehouse (only locations that sold anything). */
  async locationDemand(days: number): Promise<DemandSeries[]> {
    const today = await this.today();
    const dates = dayRange(today, days);
    const index = new Map(dates.map((d, i) => [d, i]));
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        warehouse_id: string;
        date: Date;
        q: number;
        sku: string;
        name: string;
        code: string;
      }>
    >`
      SELECT s.product_id, s.warehouse_id, s.date, s.quantity AS q, p.sku, p.name, w.code
      FROM sales_daily s
      JOIN products p ON p.id = s.product_id AND p.status = 'ACTIVE'
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.date > ${today}::date - ${days}::int AND s.date <= ${today}::date`;
    const out = new Map<string, DemandSeries>();
    for (const r of rows) {
      const k = `${r.product_id}|${r.warehouse_id}`;
      let s = out.get(k);
      if (!s) {
        s = {
          productId: r.product_id,
          sku: r.sku,
          name: r.name,
          warehouseId: r.warehouse_id,
          warehouseCode: r.code,
          daily: new Array<number>(days).fill(0),
          dates,
        };
        out.set(k, s);
      }
      const i = index.get(isoDay(r.date) ?? '');
      if (i !== undefined) s.daily[i] = r.q;
    }
    return [...out.values()];
  }

  async adjustments(days: number): Promise<Adjustment[]> {
    const today = await this.today();
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const since = new Date(`${addDays(today, -days)}T00:00:00Z`);
    const rows = await this.prisma.stockMovement.findMany({
      where: { type: { in: ['ADJUSTMENT', 'WRITE_OFF'] }, quantity: { lt: 0 }, occurredAt: { gte: since } },
      select: {
        productId: true,
        warehouseId: true,
        quantity: true,
        unitCost: true,
        occurredAt: true,
        reasonCode: { select: { code: true } },
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true } },
      },
    });
    return rows.map((r) => ({
      productId: r.productId,
      sku: r.product.sku,
      name: r.product.name,
      warehouseId: r.warehouseId,
      warehouseCode: r.warehouse.code,
      date: localDay(r.occurredAt, tz),
      quantity: r.quantity,
      reason: r.reasonCode?.code ?? null,
      unitCost: Number(r.unitCost),
    }));
  }

  /** Counted lines from counts finished or in review recently. */
  async countLines(days: number): Promise<CountLine[]> {
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const since = new Date(Date.now() - days * 86_400_000);
    const counts = await this.prisma.cycleCount.findMany({
      where: { status: { in: ['IN_REVIEW', 'COMPLETED'] }, updatedAt: { gte: since } },
      select: {
        id: true,
        number: true,
        warehouseId: true,
        updatedAt: true,
        lines: {
          where: { countedQty: { not: null } },
          select: {
            productId: true,
            expectedQty: true,
            countedQty: true,
            product: { select: { sku: true, name: true, costPrice: true } },
          },
        },
      },
    });
    const codes = await this.warehouseCodes();
    return counts.flatMap((c) =>
      c.lines.map((l) => ({
        cycleCountId: c.id,
        countNumber: c.number,
        productId: l.productId,
        sku: l.product.sku,
        name: l.product.name,
        warehouseId: c.warehouseId,
        warehouseCode: codes.get(c.warehouseId) ?? '—',
        expected: l.expectedQty,
        counted: l.countedQty ?? l.expectedQty,
        unitCost: Number(l.product.costPrice),
        date: localDay(c.updatedAt, tz),
      })),
    );
  }

  async receiptLines(days: number): Promise<ReceiptLine[]> {
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.goodsReceiptLine.findMany({
      where: { goodsReceipt: { receivedAt: { gte: since } } },
      select: {
        productId: true,
        quantityReceived: true,
        unitCost: true,
        goodsReceipt: { select: { number: true, receivedAt: true, warehouseId: true } },
        purchaseOrderLine: {
          select: {
            product: { select: { sku: true, name: true } },
            quantityOrdered: true,
            quantityReceived: true,
            quantityRejected: true,
            unitCost: true,
            purchaseOrder: {
              select: {
                number: true,
                status: true,
                expectedDate: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    const codes = await this.warehouseCodes();
    return rows.map((r) => ({
      receiptNumber: r.goodsReceipt.number,
      poNumber: r.purchaseOrderLine.purchaseOrder.number,
      supplierId: r.purchaseOrderLine.purchaseOrder.supplier.id,
      supplierName: r.purchaseOrderLine.purchaseOrder.supplier.name,
      productId: r.productId,
      sku: r.purchaseOrderLine.product.sku,
      name: r.purchaseOrderLine.product.name,
      warehouseId: r.goodsReceipt.warehouseId,
      warehouseCode: codes.get(r.goodsReceipt.warehouseId) ?? '—',
      ordered: r.purchaseOrderLine.quantityOrdered,
      poStatus: r.purchaseOrderLine.purchaseOrder.status,
      poExpectedDate: isoDay(r.purchaseOrderLine.purchaseOrder.expectedDate),
      receivedToDate: r.purchaseOrderLine.quantityReceived + r.purchaseOrderLine.quantityRejected,
      received: r.quantityReceived,
      poUnitCost: Number(r.purchaseOrderLine.unitCost),
      receivedUnitCost: Number(r.unitCost),
      date: localDay(r.goodsReceipt.receivedAt, tz),
    }));
  }

  /** Unit costs on purchase orders (by order date) per product × supplier. */
  async costHistory(days: number): Promise<CostPoint[]> {
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { orderDate: { gte: since }, status: { notIn: ['DRAFT', 'CANCELLED'] } } },
      select: {
        productId: true,
        unitCost: true,
        product: { select: { sku: true, name: true } },
        purchaseOrder: { select: { orderDate: true, supplier: { select: { id: true, name: true } } } },
      },
    });
    return rows.map((r) => ({
      productId: r.productId,
      sku: r.product.sku,
      name: r.product.name,
      supplierId: r.purchaseOrder.supplier.id,
      supplierName: r.purchaseOrder.supplier.name,
      date: localDay(r.purchaseOrder.orderDate, tz),
      unitCost: Number(r.unitCost),
    }));
  }

  /** Annual cost of goods sold per product (ABC) and weekly units for the last 52 weeks (XYZ). */
  async consumption(): Promise<{ value: Map<string, number>; weekly: Map<string, number[]> }> {
    const today = await this.today();
    const rows = await this.prisma.$queryRaw<
      Array<{ product_id: string; week: number; q: number; cogs: number }>
    >`
      SELECT product_id, FLOOR((${today}::date - date) / 7)::int AS week,
             SUM(quantity)::int AS q, SUM(cogs)::float8 AS cogs
      FROM sales_daily WHERE date > ${today}::date - 364 AND date <= ${today}::date
      GROUP BY 1, 2`;
    const value = new Map<string, number>();
    const weekly = new Map<string, number[]>();
    for (const r of rows) {
      value.set(r.product_id, (value.get(r.product_id) ?? 0) + r.cogs);
      let w = weekly.get(r.product_id);
      if (!w) weekly.set(r.product_id, (w = new Array<number>(52).fill(0)));
      const i = 51 - r.week;
      if (i >= 0 && i < 52) w[i] = r.q;
    }
    return { value, weekly };
  }

  /** Product counts and stock value per ABC × XYZ cell, from the Optimizer's last classification. */
  async classSummary() {
    const rows = await this.prisma.$queryRaw<
      Array<{ abc: string | null; xyz: string | null; products: number; value: number }>
    >`
      SELECT p.abc_class AS abc, p.xyz_class AS xyz, COUNT(DISTINCT p.id)::int AS products,
             COALESCE(SUM(v.value), 0)::float8 AS value
      FROM products p LEFT JOIN v_stock_positions v ON v.product_id = p.id
      WHERE p.status = 'ACTIVE' GROUP BY 1, 2 ORDER BY 1, 2`;
    const classifiedAt = await this.prisma.product.aggregate({ _max: { classifiedAt: true } });
    return {
      classifiedAt: classifiedAt._max.classifiedAt?.toISOString() ?? null,
      cells: rows.map((r) => ({
        abc: r.abc ?? 'unclassified',
        xyz: r.xyz ?? 'unclassified',
        products: r.products,
        stockValue: Math.round(r.value),
      })),
    };
  }

  /** Units, revenue and margin over the last `days`, grouped by category, warehouse or product. */
  async salesSummary(days: number, groupBy: 'category' | 'warehouse' | 'product', limit: number) {
    const today = await this.today();
    const rows = await this.prisma.$queryRaw<
      Array<{ key: string; label: string; units: number; revenue: number; cogs: number }>
    >`
      SELECT
        CASE ${groupBy} WHEN 'category' THEN COALESCE(pc.name, c.name) WHEN 'warehouse' THEN w.code ELSE p.sku END AS key,
        CASE ${groupBy} WHEN 'category' THEN COALESCE(pc.name, c.name) WHEN 'warehouse' THEN w.name ELSE p.name END AS label,
        SUM(s.quantity)::int AS units, SUM(s.revenue)::float8 AS revenue, SUM(s.cogs)::float8 AS cogs
      FROM sales_daily s
      JOIN products p ON p.id = s.product_id
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN categories pc ON pc.id = c.parent_id
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.date > ${today}::date - ${days}::int AND s.date <= ${today}::date
      GROUP BY 1, 2 ORDER BY revenue DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      units: r.units,
      revenue: Math.round(r.revenue),
      grossMargin: r.revenue > 0 ? Math.round(((r.revenue - r.cogs) / r.revenue) * 1000) / 10 : null,
    }));
  }

  /** Every stocked position with the numbers the optimizer needs. */
  async stockLines(opts: {
    serviceLevel: number;
    orderCostInr: number;
    holdingRate: number;
  }): Promise<StockLine[]> {
    const today = await this.today();
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        sku: string;
        name: string;
        warehouse_id: string;
        code: string;
        on_hand: number;
        available: number;
        unit_cost: number;
        selling: number;
        cost: number;
        reorder_point: number | null;
        safety_stock: number | null;
        max_stock: number | null;
        lead: number | null;
        last_sale: Date | null;
        s: number | null;
        ss: number | null;
      }>
    >`
      SELECT v.product_id, p.sku, p.name, v.warehouse_id, w.code, v.on_hand, v.available,
             COALESCE(NULLIF(v.avg_cost, 0), p.cost_price)::float8 AS unit_cost,
             p.selling_price::float8 AS selling, p.cost_price::float8 AS cost,
             v.reorder_point, v.safety_stock, v.max_stock, p.lead_time_days AS lead,
             ls.last_sale, d.s, d.ss
      FROM v_stock_positions v
      JOIN products p ON p.id = v.product_id AND p.status = 'ACTIVE'
      JOIN warehouses w ON w.id = v.warehouse_id AND w.is_active
      LEFT JOIN LATERAL (
        SELECT MAX(date) AS last_sale FROM sales_daily sd
        WHERE sd.product_id = v.product_id AND sd.warehouse_id = v.warehouse_id AND sd.quantity > 0
      ) ls ON true
      LEFT JOIN LATERAL (
        SELECT SUM(quantity)::float8 AS s, SUM(quantity::float8 * quantity::float8) AS ss FROM sales_daily sd
        WHERE sd.product_id = v.product_id AND sd.warehouse_id = v.warehouse_id
          AND sd.date > ${today}::date - 56
      ) d ON true`;
    return rows.map((r) => {
      const mean = (r.s ?? 0) / 56;
      const std = Math.sqrt(Math.max(0, (r.ss ?? 0) / 56 - mean * mean));
      const lead = r.lead ?? 7;
      const policy =
        mean > 0
          ? computePolicy(mean, std, lead, r.unit_cost, { ...opts, reviewPeriodDays: 7, leadTimeCv: 0.15 })
          : null;
      const last = isoDay(r.last_sale);
      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        warehouseId: r.warehouse_id,
        warehouseCode: r.code,
        onHand: r.on_hand,
        available: r.available,
        unitCost: r.unit_cost,
        sellingPrice: r.selling,
        costPrice: r.cost,
        avgDaily: mean,
        daysSinceSale: last
          ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000)
          : null,
        leadTimeDays: lead,
        configuredRop: r.reorder_point,
        computedRop: policy?.reorderPoint ?? null,
        safetyStock: policy?.safetyStock ?? null,
        maxStock: r.max_stock,
      };
    });
  }
}
