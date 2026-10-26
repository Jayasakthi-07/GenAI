import {
  ALERT_TYPES,
  alertsQuerySchema,
  PO_OPEN_STATUSES,
  STOCK_STATES,
  stockPositionsQuerySchema,
  poListQuerySchema,
  productListQuerySchema,
  SEVERITIES,
  suppliersQuerySchema,
} from '@stockroom/shared';
import { z } from 'zod';
import { chooseSupplier, planReplenishment } from '../../analytics/replenishment';
import { AppError } from '../../domain/errors';
import { defineTool, type ToolContext } from '../types';

const limit = (max: number, def: number) =>
  z.number().int().min(1).max(max).default(def).describe(`How many rows (1–${max})`);
const productRef = z.string().min(1).describe('Product id or SKU, from a previous tool result');

export async function resolveOne(
  ctx: ToolContext,
  kind: 'product' | 'warehouse' | 'supplier',
  ref: string,
): Promise<string> {
  const id = (await ctx.services.planning.resolve(kind, [ref])).get(ref.trim());
  if (!id)
    throw new AppError('VALIDATION_ERROR', `Unknown ${kind} “${ref}”. Use an id or code from a tool result.`);
  return id;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export const readTools = [
  defineTool({
    name: 'get_inventory_kpis',
    kind: 'read',
    description:
      'Headline numbers for the whole business: inventory value, 30-day revenue and units, fill rate, stockouts, open alerts, open POs, pending approvals, turnover, and the locations most at risk of running out.',
    input: z.object({}),
    label: () => 'Reading the headline numbers…',
    run: async (ctx) => {
      const o = await ctx.services.dashboard.overview(30);
      return {
        asOf: o.asOf,
        periodDays: o.periodDays,
        kpis: o.kpis,
        mostAtRisk: o.stockoutRisk.slice(0, 10),
      };
    },
  }),

  defineTool({
    name: 'search_products',
    kind: 'read',
    description: 'Find products by name, SKU, brand or barcode. Returns stock totals across warehouses.',
    input: z.object({ query: z.string().min(1).max(100), limit: limit(20, 10) }),
    label: (a) => `Searching products for “${a.query}”…`,
    run: async (ctx, a) => {
      const res = await ctx.services.products.list(
        productListQuerySchema.parse({ q: a.query, pageSize: a.limit, status: 'ACTIVE' }),
      );
      return {
        total: res.meta.total,
        products: res.data.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          category: p.category.path,
          available: p.available,
          onOrder: p.onOrder,
          stockState: p.stockState,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          abc: p.abcClass,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_product_details',
    kind: 'read',
    description:
      'One product in depth: prices, policy (reorder point, safety stock, max), stock per warehouse with days of cover, recent sales and its suppliers.',
    input: z.object({ product: productRef }),
    label: () => 'Looking up the product…',
    run: async (ctx, a) => {
      const id = await resolveOne(ctx, 'product', a.product);
      const [p, sales, suppliers] = await Promise.all([
        ctx.services.products.get(id),
        ctx.services.products.sales(id, 28),
        ctx.services.products.suppliers(id),
      ]);
      const last7 = sales.slice(-7).reduce((s, d) => s + d.quantity, 0);
      const last28 = sales.reduce((s, d) => s + d.quantity, 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        category: p.category.path,
        status: p.status,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        mrp: p.mrp,
        leadTimeDays: p.leadTimeDays,
        shelfLifeDays: p.shelfLifeDays,
        abc: p.abcClass,
        xyz: p.xyzClass,
        preferredSupplier: p.preferredSupplier?.name ?? null,
        stock: p.stock.map((s) => ({
          warehouseId: s.warehouse.id,
          warehouse: s.warehouse.code,
          onHand: s.onHand,
          available: s.available,
          onOrder: s.onOrder,
          reorderPoint: s.reorderPoint,
          safetyStock: s.safetyStock,
          maxStock: s.maxStock,
          avgDailyDemand: round(s.avgDailyDemand, 2),
          daysOfCover: s.daysOfCover === null ? null : round(s.daysOfCover),
          state: s.state,
        })),
        sales: { last7Days: last7, last28Days: last28, perDay28: round(last28 / 28, 2) },
        suppliers: suppliers.slice(0, 6).map((s) => ({
          supplierId: s.supplier.id,
          supplier: s.supplier.name,
          code: s.supplier.code,
          unitCost: s.unitCost,
          moq: s.moq,
          packSize: s.packSize,
          leadTimeDays: s.leadTimeDays,
          score: s.supplierScore,
          preferred: s.isPreferred,
          active: s.isActive && s.supplierActive,
        })),
      };
    },
  }),

  defineTool({
    name: 'list_stock_positions',
    kind: 'read',
    description:
      'Stock by product × warehouse: on hand, available, on order, reorder point, days of cover and state (OUT = none available, LOW = at or below the reorder point and not covered by orders, ON_ORDER = low but covered, OVER = above twice the max, OK). Filter by warehouse, state or product. Lowest cover first.',
    input: z.object({
      warehouse: z.string().optional().describe('Warehouse id or code'),
      state: z.enum(STOCK_STATES).optional(),
      product: z.string().optional().describe('Product id or SKU'),
      limit: limit(40, 20),
    }),
    label: (a) =>
      `Checking stock${a.state ? ` (${a.state.toLowerCase().replace('_', ' ')})` : ''}${a.warehouse ? ` at ${a.warehouse}` : ''}…`,
    run: async (ctx, a) => {
      const warehouseId = a.warehouse ? await resolveOne(ctx, 'warehouse', a.warehouse) : undefined;
      const productId = a.product ? await resolveOne(ctx, 'product', a.product) : undefined;
      const res = await ctx.services.inventory.positions(
        stockPositionsQuerySchema.parse({
          pageSize: a.limit,
          warehouseId,
          productId,
          state: a.state,
          sort: 'daysOfCover:asc',
        }),
      );
      return {
        total: res.meta.total,
        positions: res.data.map((p) => ({
          productId: p.product.id,
          sku: p.product.sku,
          name: p.product.name,
          warehouse: p.warehouse.code,
          state: p.state,
          onHand: p.onHand,
          available: p.available,
          onOrder: p.onOrder,
          reorderPoint: p.reorderPoint,
          perDay: round(p.avgDailyDemand, 2),
          daysOfCover: p.daysOfCover === null ? null : round(p.daysOfCover),
          value: p.value,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_sales_history',
    kind: 'read',
    description: 'Units and revenue per week for one product (all warehouses), most recent last.',
    input: z.object({ product: productRef, weeks: z.number().int().min(2).max(26).default(8) }),
    label: (a) => `Reading ${a.weeks} weeks of sales…`,
    run: async (ctx, a) => {
      const id = await resolveOne(ctx, 'product', a.product);
      const days = await ctx.services.products.sales(id, a.weeks * 7);
      const weeks: Array<{ weekStarting: string; units: number; revenue: number }> = [];
      for (let i = 0; i < days.length; i += 7) {
        const chunk = days.slice(i, i + 7);
        weeks.push({
          weekStarting: chunk[0]?.date ?? '',
          units: chunk.reduce((s, d) => s + d.quantity, 0),
          revenue: Math.round(chunk.reduce((s, d) => s + d.revenue, 0)),
        });
      }
      return { productId: id, weeks };
    },
  }),

  defineTool({
    name: 'list_open_alerts',
    kind: 'read',
    description: 'Open alerts (highest priority first), optionally filtered by type or severity.',
    input: z.object({
      type: z.enum(ALERT_TYPES).optional(),
      severity: z.enum(SEVERITIES).optional(),
      warehouse: z.string().optional().describe('Warehouse id or code'),
      limit: limit(40, 20),
    }),
    label: () => 'Checking open alerts…',
    run: async (ctx, a) => {
      const warehouseId = a.warehouse ? await resolveOne(ctx, 'warehouse', a.warehouse) : undefined;
      const res = await ctx.services.alerts.list(
        alertsQuerySchema.parse({ pageSize: a.limit, type: a.type, severity: a.severity, warehouseId }),
      );
      return {
        total: res.meta.total,
        alerts: res.data.map((x) => ({
          id: x.id,
          type: x.type,
          severity: x.severity,
          priority: x.priority,
          title: x.title,
          facts: x.message,
          productId: x.product?.id ?? null,
          sku: x.product?.sku ?? null,
          warehouse: x.warehouse?.code ?? null,
          since: x.createdAt.slice(0, 10),
        })),
      };
    },
  }),

  defineTool({
    name: 'list_open_purchase_orders',
    kind: 'read',
    description: 'Purchase orders not yet fully received, with expected dates and whether they are overdue.',
    input: z.object({
      supplier: z.string().optional().describe('Supplier id or code'),
      limit: limit(40, 20),
    }),
    label: () => 'Checking open purchase orders…',
    run: async (ctx, a) => {
      const supplierId = a.supplier ? await resolveOne(ctx, 'supplier', a.supplier) : undefined;
      const res = await ctx.services.purchaseOrders.list(
        poListQuerySchema.parse({ pageSize: a.limit, status: PO_OPEN_STATUSES.join(','), supplierId }),
      );
      return {
        total: res.meta.total,
        orders: res.data.map((p) => ({
          number: p.number,
          supplier: p.supplier.name,
          warehouse: p.warehouse.code,
          status: p.status,
          expected: p.expectedDate,
          overdue: p.overdue,
          total: p.total,
          lines: p.lineCount,
          received: `${Math.round(p.receivedRatio * 100)}%`,
        })),
      };
    },
  }),

  defineTool({
    name: 'list_pending_actions',
    kind: 'read',
    description:
      'Proposals (from any agent) waiting for a person to approve. Avoid proposing the same thing again.',
    input: z.object({ limit: limit(40, 20) }),
    label: () => 'Checking proposals awaiting approval…',
    run: async (ctx, a) => {
      const res = await ctx.services.actions.list({ page: 1, pageSize: a.limit, status: ['PENDING'] });
      return {
        total: res.meta.total,
        pending: res.data.map((x) => ({
          agent: x.agent.name,
          type: x.type,
          title: x.title,
          summary: x.summary,
          risk: x.riskLevel,
          created: x.createdAt.slice(0, 10),
        })),
      };
    },
  }),

  defineTool({
    name: 'compare_suppliers',
    kind: 'read',
    description:
      'All suppliers of one product with cost, MOQ, pack size, lead time and score, and which one the weighted rule (50 % cost, 30 % lead time, 20 % score) picks.',
    input: z.object({ product: productRef }),
    label: () => 'Comparing suppliers…',
    run: async (ctx, a) => {
      const id = await resolveOne(ctx, 'product', a.product);
      const options = (await ctx.services.planning.supplierOptions([id])).get(id) ?? [];
      const pick = chooseSupplier(options);
      return {
        productId: id,
        suppliers: options.map((o) => ({
          supplierId: o.supplierId,
          supplier: o.supplierName,
          unitCost: o.unitCost,
          moq: o.moq,
          packSize: o.packSize,
          leadTimeDays: o.leadTimeDays,
          score: o.score,
          preferred: o.isPreferred,
          active: o.isActive,
        })),
        recommended: pick
          ? { supplierId: pick.option.supplierId, supplier: pick.option.supplierName, why: pick.reason }
          : null,
      };
    },
  }),

  defineTool({
    name: 'get_supplier_scorecards',
    kind: 'read',
    description: 'Supplier scores (0–100), risk level, open orders and open order value, worst score first.',
    input: z.object({ limit: limit(40, 20) }),
    label: () => 'Reading supplier scorecards…',
    run: async (ctx, a) => {
      const res = await ctx.services.suppliers.list(
        suppliersQuerySchema.parse({ pageSize: 200, active: 'true' }),
      );
      return {
        suppliers: res.data
          .sort((x, y) => (x.score ?? 101) - (y.score ?? 101))
          .slice(0, a.limit)
          .map((s) => ({
            supplierId: s.id,
            code: s.code,
            name: s.name,
            score: s.score,
            risk: s.riskLevel,
            products: s.productCount,
            openOrders: s.openPoCount,
            openValue: s.openPoValue,
          })),
      };
    },
  }),

  defineTool({
    name: 'compute_reorder_plan',
    kind: 'read',
    description:
      'The computed replenishment plan: for each product × warehouse at or below its reorder point, the chosen supplier, quantity (EOQ / order-up-to, rounded to MOQ and pack), cost, cover before and after, urgency and flags. Already budget-checked. Use these numbers; do not recompute them.',
    input: z.object({
      warehouse: z.string().optional().describe('Warehouse id or code'),
      limit: limit(40, 25),
    }),
    label: () => 'Computing the reorder plan…',
    run: async (ctx, a) => {
      const warehouseId = a.warehouse ? await resolveOne(ctx, 'warehouse', a.warehouse) : undefined;
      const items = (await ctx.services.planning.replenishmentItems()).filter(
        (i) => !warehouseId || i.warehouseId === warehouseId,
      );
      const pending = await ctx.services.actions.openPoProducts();
      const plan = planReplenishment(
        items.filter((i) => !pending.has(`${i.productId}|${i.warehouseId}`)),
        {
          serviceLevel: ctx.org.serviceLevel,
          orderCostInr: ctx.org.orderCostInr,
          holdingRate: ctx.org.holdingRate,
          reviewPeriodDays: 7,
          budgetInr: ctx.org.replenishmentBudgetInr,
          leadTimeCv: 0.15,
        },
      );
      const line = (l: (typeof plan.lines)[number]) => ({
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        warehouseId: l.warehouseId,
        warehouse: l.warehouseCode,
        supplierId: l.supplierId,
        supplier: l.supplierName,
        quantity: l.quantity,
        unitCost: l.unitCost,
        lineValue: l.lineValue,
        available: l.available,
        onOrder: l.onOrder,
        reorderPoint: l.triggerPoint,
        daysOfCover: l.daysOfCover,
        coverAfter: l.coverAfter,
        leadTimeDays: l.leadTimeDays,
        urgent: l.urgent,
        flags: l.flags,
      });
      return {
        budget: plan.totals.budget,
        plannedValue: plan.totals.value,
        lines: plan.lines.slice(0, a.limit).map(line),
        deferredOverBudget: plan.deferred.slice(0, 10).map(line),
        noActiveSupplier: plan.blocked.slice(0, 10).map((l) => ({ sku: l.sku, warehouse: l.warehouseCode })),
        alreadyProposed: pending.size,
      };
    },
  }),
];
