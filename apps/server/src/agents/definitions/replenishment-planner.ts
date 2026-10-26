import { formatMoney, type RunFinding } from '@stockroom/shared';
import { groupIntoOrders, type Plan, type PlanLine, planReplenishment } from '../../analytics/replenishment';
import { baseOutput } from '../output';
import type { AgentModule, ProposalDraft } from '../types';

const MAX_ORDERS = 10;
const MAX_LINES = 15;
const inr = (n: number) => formatMoney(n.toFixed(2), { compactDecimals: true });

interface State {
  plan: Plan;
  orders: ReturnType<typeof groupIntoOrders>;
}

const line = (l: PlanLine) => ({
  productId: l.productId,
  sku: l.sku,
  name: l.name,
  quantity: l.quantity,
  unitCost: l.unitCost,
  lineValue: l.lineValue,
  available: l.available,
  onOrder: l.onOrder,
  reorderPoint: l.triggerPoint,
  computedReorderPoint: l.reorderPoint,
  safetyStock: l.safetyStock,
  demandPerDay: l.demandMean,
  demandSource: l.demandSource,
  daysOfCover: l.daysOfCover,
  coverAfter: l.coverAfter,
  leadTimeDays: l.leadTimeDays,
  urgent: l.urgent,
  flags: l.flags,
});

export const replenishmentPlanner: AgentModule<State> = {
  key: 'replenishment_planner',
  name: 'Replenishment Planner',
  description: 'Turns low stock into ready-to-approve purchase orders, one per supplier, within the budget.',
  analyzer:
    'Safety stock z·√(L·σd² + d̄²·σL²), reorder point d̄·L + SS, EOQ √(2DS/H) and order-up-to over lead time plus review period, rounded to MOQ and pack size. Inventory position counts stock on order. Suppliers chosen by weighted landed cost, lead time and score; lines filled by priority up to the budget.',
  llmJob:
    'Reviews the computed orders, picks and justifies suppliers, trims to the budget with reasons, and flags judgment calls.',
  outputs: 'Purchase-order proposals with a rationale per line.',
  tools: [
    'compute_reorder_plan',
    'compare_suppliers',
    'get_product_details',
    'get_sales_history',
    'list_open_purchase_orders',
    'list_pending_actions',
    'get_supplier_scorecards',
    'propose_purchase_order',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Replenishment Planner. The analysis contains purchase orders already computed by code (quantities from EOQ and order-up-to levels, rounded to supplier MOQ and pack size, within the budget). Review each order: keep it, trim lines with a reason, or switch supplier if compare_suppliers shows a clearly better option. Then call propose_purchase_order once per order you support, with a one-sentence rationale per line that cites the numbers (days of cover, lead time, reorder point). Never change quantities below the supplier minimum. Mention deferred and blocked items in your findings.',
    triggers: { cron: ['0 7 * * *'], events: [], debounceSeconds: 0 },
    autonomy: 'RECOMMEND',
    limits: {
      maxSteps: 10,
      maxToolCalls: 16,
      timeoutMs: 420_000,
      maxActionsPerRun: 8,
      maxPoValueInr: 50_000,
    },
    config: {},
  },
  output: baseOutput,
  outputExample: {
    summary: '<one or two sentences on what you proposed and what you left out, and why>',
    findings: [
      {
        title: '<a judgment call or risk worth a person’s attention>',
        detail: '<the facts behind it, quoting numbers from the analysis or tool results>',
        severity: 'MEDIUM',
      },
    ],
  },

  async analyze(ctx) {
    const items = await ctx.services.planning.replenishmentItems();
    const pending = await ctx.services.actions.openPoProducts();
    const focus = new Set(ctx.trigger === 'HANDOFF' ? ctx.focusProductIds : []);
    const candidates = items.filter(
      (i) => !pending.has(`${i.productId}|${i.warehouseId}`) && (!focus.size || focus.has(i.productId)),
    );
    const plan = planReplenishment(candidates, {
      serviceLevel: ctx.org.serviceLevel,
      orderCostInr: ctx.org.orderCostInr,
      holdingRate: ctx.org.holdingRate,
      reviewPeriodDays: 7,
      budgetInr: ctx.org.replenishmentBudgetInr,
      leadTimeCv: 0.15,
    });
    const orders = groupIntoOrders(plan.lines)
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.value - a.value)
      .slice(0, MAX_ORDERS);

    const findings: RunFinding[] = [];
    if (plan.deferred.length)
      findings.push({
        title: `${plan.deferred.length} item${plan.deferred.length === 1 ? '' : 's'} deferred over the budget`,
        detail: `${inr(plan.totals.deferredValue)} more would be needed: ${plan.deferred
          .slice(0, 6)
          .map((l) => `${l.sku} at ${l.warehouseCode}`)
          .join(', ')}.`,
        severity: 'MEDIUM',
      });
    if (plan.blocked.length)
      findings.push({
        title: `${plan.blocked.length} item${plan.blocked.length === 1 ? '' : 's'} have no active supplier`,
        detail: `Link a supplier to reorder: ${plan.blocked
          .slice(0, 6)
          .map((l) => l.sku)
          .join(', ')}.`,
        severity: 'HIGH',
      });
    for (const l of plan.lines.filter((x) => x.flags.length).slice(0, 4))
      findings.push({ title: `${l.sku} at ${l.warehouseCode}`, detail: l.flags.join('; '), severity: 'LOW' });

    const proposals: ProposalDraft[] = orders.map((o) => ({
      type: 'CREATE_PURCHASE_ORDER',
      payload: {
        supplierId: o.supplierId,
        warehouseId: o.warehouseId,
        lines: o.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost.toFixed(2),
          rationale: l.rationale,
        })),
      },
      rationale: `${o.lines.length} item${o.lines.length === 1 ? '' : 's'} at ${o.warehouseCode} at or below the reorder point${o.urgent ? ', some running out before a new delivery could arrive' : ''}. ${o.supplierName} chosen by weighted cost, lead time and score. Quantities follow EOQ and order-up-to levels, rounded to the supplier’s MOQ and pack size.`,
    }));

    const value = orders.reduce((a, o) => a + o.value, 0);
    const summary = orders.length
      ? `Planned ${orders.length} purchase order${orders.length === 1 ? '' : 's'} worth ${inr(value)} for ${plan.lines.length} item${plan.lines.length === 1 ? '' : 's'}.`
      : 'Nothing needs reordering right now.';
    return {
      headline: orders.length
        ? `${plan.lines.length} items need ordering · ${orders.length} orders · ${inr(value)}`
        : `Nothing to reorder (${pending.size} already proposed)`,
      facts: {
        budget: plan.totals.budget,
        plannedValue: Math.round(value),
        focus: focus.size
          ? `Hand-off: only the ${focus.size} product(s) the Stock Sentinel flagged`
          : 'Full daily plan',
        orders: orders.map((o) => ({
          supplierId: o.supplierId,
          supplier: o.supplierName,
          warehouseId: o.warehouseId,
          warehouse: o.warehouseCode,
          value: o.value,
          urgent: o.urgent,
          lines: o.lines.slice(0, MAX_LINES).map(line),
          moreLines: Math.max(0, o.lines.length - MAX_LINES),
        })),
        deferredOverBudget: plan.deferred.slice(0, 8).map(line),
        noActiveSupplier: plan.blocked.slice(0, 8).map((l) => ({ sku: l.sku, warehouse: l.warehouseCode })),
        alreadyProposed: pending.size,
      },
      fingerprint: orders
        .flatMap((o) => o.lines.map((l) => `${o.supplierId}:${o.warehouseId}:${l.productId}:${l.quantity}`))
        .sort()
        .join('|'),
      nothingToDo: orders.length === 0,
      ruleBased: { summary, findings, proposals },
      state: { plan, orders },
    };
  },
};
