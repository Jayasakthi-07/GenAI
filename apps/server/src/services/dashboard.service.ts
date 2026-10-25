import type { DashboardOverview } from '@stockroom/shared';
import type { Db } from '../db/client';
import { money } from './support';

const KPI_DAYS = 30;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dashboard aggregates. Everything is computed in SQL over rollup tables; no per-row work in JS. */
export class DashboardService {
  constructor(private readonly prisma: Db) {}

  private async today(): Promise<{ today: string; tz: string }> {
    const org = await this.prisma.organization.findFirst({ select: { timezone: true } });
    const tz = org?.timezone ?? 'Asia/Kolkata';
    const rows = await this.prisma.$queryRaw<
      Array<{ today: Date }>
    >`SELECT (now() AT TIME ZONE ${tz})::date AS today`;
    return { today: iso(rows[0]?.today ?? new Date()), tz };
  }

  async overview(days: number): Promise<DashboardOverview> {
    const { today, tz } = await this.today();
    const kpiStart = addDays(today, -KPI_DAYS);
    const prevStart = addDays(today, -2 * KPI_DAYS);
    const chartStart = addDays(today, -days);

    const [stock, sales, fill, valueRows, compareValue, salesRows, mix, movers, counts, extras, risk] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ value: string; out: number; reorder: number }>>`
        SELECT COALESCE(SUM(v.value), 0)::numeric(16, 2)::text AS value,
               COUNT(*) FILTER (WHERE v.state = 'OUT')::int AS out,
               COUNT(*) FILTER (WHERE v.state = 'LOW')::int AS reorder
        FROM v_stock_positions v
        JOIN products p ON p.id = v.product_id AND p.status = 'ACTIVE'`,
        this.prisma.$queryRaw<
          Array<{ revenue: string; prev_revenue: string; units: number; prev_units: number; cogs90: string }>
        >`
        SELECT COALESCE(SUM(revenue) FILTER (WHERE date > ${kpiStart}::date), 0)::text AS revenue,
               COALESCE(SUM(revenue) FILTER (WHERE date > ${prevStart}::date AND date <= ${kpiStart}::date), 0)::text AS prev_revenue,
               COALESCE(SUM(quantity) FILTER (WHERE date > ${kpiStart}::date), 0)::int AS units,
               COALESCE(SUM(quantity) FILTER (WHERE date > ${prevStart}::date AND date <= ${kpiStart}::date), 0)::int AS prev_units,
               COALESCE(SUM(cogs) FILTER (WHERE date > ${today}::date - 90), 0)::text AS cogs90
        FROM sales_daily
        WHERE date > LEAST(${prevStart}::date, ${today}::date - 90)`,
        this.prisma.$queryRaw<Array<{ cur: number | null; prev: number | null }>>`
        SELECT (SUM(l.quantity_fulfilled) FILTER (WHERE (o.order_date AT TIME ZONE ${tz})::date > ${kpiStart}::date))::float8
                 / NULLIF(SUM(l.quantity) FILTER (WHERE (o.order_date AT TIME ZONE ${tz})::date > ${kpiStart}::date), 0) AS cur,
               (SUM(l.quantity_fulfilled) FILTER (WHERE (o.order_date AT TIME ZONE ${tz})::date <= ${kpiStart}::date))::float8
                 / NULLIF(SUM(l.quantity) FILTER (WHERE (o.order_date AT TIME ZONE ${tz})::date <= ${kpiStart}::date), 0) AS prev
        FROM sales_order_lines l
        JOIN sales_orders o ON o.id = l.sales_order_id
        WHERE o.status IN ('FULFILLED', 'PARTIALLY_FULFILLED')
          AND o.order_date >= (${prevStart}::date)::timestamp AT TIME ZONE ${tz}`,
        this.prisma.$queryRaw<Array<{ date: Date; value: number }>>`
        SELECT date, ROUND(SUM(total_value))::float8 AS value
        FROM inventory_snapshots
        WHERE date > ${chartStart}::date
        GROUP BY date ORDER BY date`,
        this.prisma.$queryRaw<Array<{ value: string | null }>>`
        SELECT SUM(total_value)::text AS value FROM inventory_snapshots
        WHERE date = (SELECT MAX(date) FROM inventory_snapshots WHERE date <= ${kpiStart}::date)`,
        this.prisma.$queryRaw<Array<{ date: Date; revenue: number }>>`
        SELECT date, ROUND(SUM(revenue))::float8 AS revenue
        FROM sales_daily
        WHERE date > ${addDays(chartStart, -6)}::date
        GROUP BY date ORDER BY date`,
        this.prisma.$queryRaw<Array<{ category: string; value: number }>>`
        SELECT COALESCE(parent.name, c.name) AS category, ROUND(SUM(sl.on_hand * sl.avg_cost))::float8 AS value
        FROM stock_levels sl
        JOIN products p ON p.id = sl.product_id
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        GROUP BY 1
        HAVING SUM(sl.on_hand * sl.avg_cost) > 0
        ORDER BY 2 DESC`,
        this.prisma.$queryRaw<
          Array<{
            product_id: string;
            sku: string;
            name: string;
            category: string;
            units: number;
            revenue: number;
            prev: number;
          }>
        >`
        SELECT p.id AS product_id, p.sku, p.name, COALESCE(parent.name, c.name) AS category,
               COALESCE(SUM(sd.quantity) FILTER (WHERE sd.date > ${kpiStart}::date), 0)::int AS units,
               COALESCE(SUM(sd.revenue) FILTER (WHERE sd.date > ${kpiStart}::date), 0)::float8 AS revenue,
               COALESCE(SUM(sd.revenue) FILTER (WHERE sd.date <= ${kpiStart}::date), 0)::float8 AS prev
        FROM sales_daily sd
        JOIN products p ON p.id = sd.product_id
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE sd.date > ${prevStart}::date
        GROUP BY p.id, p.sku, p.name, 4
        ORDER BY revenue DESC
        LIMIT 8`,
        this.prisma.$queryRaw<Array<{ skus: number; warehouses: number }>>`
        SELECT (SELECT COUNT(*) FROM products WHERE status = 'ACTIVE')::int AS skus,
               (SELECT COUNT(*) FROM warehouses WHERE is_active)::int AS warehouses`,
        this.prisma.$queryRaw<
          Array<{
            open_pos: number;
            open_value: string;
            overdue: number;
            pending: number;
            alerts: number;
            critical: number;
            high: number;
          }>
        >`
        SELECT
          (SELECT COUNT(*) FROM purchase_orders WHERE status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED'))::int AS open_pos,
          (SELECT COALESCE(SUM(total), 0) FROM purchase_orders WHERE status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED'))::text AS open_value,
          (SELECT COUNT(*) FROM purchase_orders
             WHERE status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED') AND expected_date < ${today}::date)::int AS overdue,
          ((SELECT COUNT(*) FROM purchase_orders WHERE status = 'PENDING_APPROVAL')
            + (SELECT COUNT(*) FROM agent_actions WHERE status = 'PENDING'))::int AS pending,
          (SELECT COUNT(*) FROM alerts WHERE status IN ('OPEN', 'ACKNOWLEDGED'))::int AS alerts,
          (SELECT COUNT(*) FROM alerts WHERE status IN ('OPEN', 'ACKNOWLEDGED') AND severity = 'CRITICAL')::int AS critical,
          (SELECT COUNT(*) FROM alerts WHERE status IN ('OPEN', 'ACKNOWLEDGED') AND severity = 'HIGH')::int AS high`,
        this.prisma.$queryRaw<
          Array<{
            product_id: string;
            sku: string;
            name: string;
            code: string;
            available: number;
            avg_daily_demand: number;
            days_of_cover: number;
            lead: number;
            on_order: number;
          }>
        >`
        SELECT v.product_id, p.sku, p.name, w.code, v.available, v.avg_daily_demand, v.days_of_cover,
               COALESCE(p.lead_time_days, 7) AS lead, v.on_order
        FROM v_stock_positions v
        JOIN products p ON p.id = v.product_id AND p.status = 'ACTIVE'
        JOIN warehouses w ON w.id = v.warehouse_id
        WHERE v.available > 0 AND v.avg_daily_demand > 0 AND v.days_of_cover < COALESCE(p.lead_time_days, 7)
        ORDER BY v.days_of_cover / GREATEST(COALESCE(p.lead_time_days, 7), 1) ASC, v.avg_daily_demand * p.cost_price DESC
        LIMIT 6`,
      ]);

    const current = stock[0] ?? { value: '0', out: 0, reorder: 0 };
    const s = sales[0] ?? { revenue: '0', prev_revenue: '0', units: 0, prev_units: 0, cogs90: '0' };
    const dailyCogs = Number(s.cogs90) / 90;

    // Value trend: daily snapshots, with today's live value as the last point.
    const valueTrend = valueRows.map((r) => ({ date: iso(r.date), value: r.value }));
    if (valueTrend.at(-1)?.date !== today)
      valueTrend.push({ date: today, value: Math.round(Number(current.value)) });

    // Sales trend over complete days only (today is still in progress), zero-filled, with a trailing 7-day average.
    const byDay = new Map(salesRows.map((r) => [iso(r.date), r.revenue]));
    const series: Array<{ date: string; revenue: number }> = [];
    for (let d = addDays(chartStart, -6); d < today; d = addDays(d, 1))
      series.push({ date: d, revenue: byDay.get(d) ?? 0 });
    const salesTrend = series.slice(6).map((point, i) => {
      const window = series.slice(i, i + 7);
      return { ...point, average: Math.round(window.reduce((a, w) => a + w.revenue, 0) / window.length) };
    });

    const mixTotal = mix.reduce((a, m) => a + m.value, 0) || 1;

    return {
      asOf: new Date().toISOString(),
      periodDays: days,
      kpis: {
        inventoryValue: { current: current.value, previous: compareValue[0]?.value ?? current.value },
        revenue: { current: s.revenue, previous: s.prev_revenue },
        unitsSold: { current: s.units, previous: s.prev_units },
        fillRate: { current: fill[0]?.cur ?? 1, previous: fill[0]?.prev ?? 1 },
        outOfStock: current.out,
        needsReorder: current.reorder,
        daysOfInventory: dailyCogs > 0 ? Math.round((Number(current.value) / dailyCogs) * 10) / 10 : 0,
        activeSkus: counts[0]?.skus ?? 0,
        warehouses: counts[0]?.warehouses ?? 0,
        openPurchaseOrders: {
          count: extras[0]?.open_pos ?? 0,
          value: money(extras[0]?.open_value ?? 0),
          overdue: extras[0]?.overdue ?? 0,
        },
        pendingApprovals: extras[0]?.pending ?? 0,
        turnover:
          Number(current.value) > 0 ? Math.round(((dailyCogs * 365) / Number(current.value)) * 10) / 10 : 0,
        openAlerts: {
          total: extras[0]?.alerts ?? 0,
          critical: extras[0]?.critical ?? 0,
          high: extras[0]?.high ?? 0,
        },
      },
      stockoutRisk: risk.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        warehouse: r.code,
        available: r.available,
        avgDailyDemand: Math.round(r.avg_daily_demand * 10) / 10,
        daysOfCover: Math.round(r.days_of_cover * 10) / 10,
        leadTimeDays: r.lead,
        onOrder: r.on_order,
      })),
      valueTrend,
      salesTrend,
      categoryMix: mix.map((m) => ({ category: m.category, value: m.value, share: m.value / mixTotal })),
      topMovers: movers.map((m) => ({
        productId: m.product_id,
        sku: m.sku,
        name: m.name,
        category: m.category,
        units: m.units,
        revenue: m.revenue,
        previousRevenue: m.prev,
      })),
    };
  }
}
