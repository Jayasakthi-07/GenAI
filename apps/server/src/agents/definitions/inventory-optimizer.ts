import { formatMoney, type RunFinding } from '@stockroom/shared';
import {
  abcClassify,
  type DeadOrSlow,
  deadAndSlow,
  type Drift,
  type Rebalance,
  rebalancing,
  reorderDrift,
  xyzClassify,
} from '../../analytics/optimization';
import type { AlertFinding } from '../../services/alert.service';
import { baseOutput } from '../output';
import type { AgentModule, ProposalDraft } from '../types';

const inr = (n: number) => formatMoney(Math.round(n), { compactDecimals: true });

interface State {
  dead: DeadOrSlow[];
  moves: Rebalance[];
  drift: Drift[];
}

export const inventoryOptimizer: AgentModule<State> = {
  key: 'inventory_optimizer',
  name: 'Inventory Optimizer',
  description:
    'Frees up cash and shelf space: classifies the range, finds dead and slow stock, rebalances warehouses and tunes reorder points.',
  analyzer:
    'ABC by annual consumption value (80 / 15 / 5 %), XYZ by the coefficient of variation of weekly demand (≤ 0.5 / ≤ 1.0 / > 1.0). Dead stock: no sale in 90 days; slow: more than 180 days of cover. Rebalancing: a warehouse with cover over 2× the 30-day target and another below its lead time. Reorder-point drift over 30 % from the computed value.',
  llmJob:
    'Ranks the opportunities by value and writes the proposals: transfers, markdowns and new reorder settings.',
  outputs: 'ABC–XYZ classes, dead-stock alerts, and transfer, markdown and reorder-setting proposals.',
  tools: [
    'get_abc_xyz_summary',
    'list_slow_and_dead_stock',
    'find_rebalancing_opportunities',
    'get_product_details',
    'get_sales_history',
    'list_pending_actions',
    'propose_transfer',
    'propose_markdown',
    'propose_reorder_params',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Inventory Optimizer. The analysis lists rebalancing moves, dead and slow stock with suggested clearance prices, and reorder points that drifted from the computed values, all calculated by code. Pick the most valuable opportunities and create proposals: propose_transfer for rebalancing, propose_markdown for dead stock (use the suggested price or higher; never below cost), propose_reorder_params for drifted settings on A and B items. Give a one-line reason per proposal with the numbers. Skip anything already waiting for approval.',
    triggers: { cron: ['0 5 * * 1'], events: [], debounceSeconds: 0 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 10, maxToolCalls: 16, timeoutMs: 420_000, maxActionsPerRun: 6, maxPoValueInr: 0 },
    config: {},
  },
  output: baseOutput,
  outputExample: {
    summary: '<one or two sentences on the main opportunities>',
    findings: [
      {
        title: '<an opportunity or risk>',
        detail: '<the numbers behind it, from the analysis>',
        severity: 'MEDIUM',
      },
    ],
  },

  async analyze(ctx) {
    const { analysis, products, alerts } = ctx.services;
    const [list, consumption, lines] = await Promise.all([
      analysis.activeProducts(),
      analysis.consumption(),
      analysis.stockLines({
        serviceLevel: ctx.org.serviceLevel,
        orderCostInr: ctx.org.orderCostInr,
        holdingRate: ctx.org.holdingRate,
      }),
    ]);
    const abc = abcClassify(list.map((p) => ({ id: p.id, value: consumption.value.get(p.id) ?? 0 })));
    const classes = new Map(
      list.map(
        (p) =>
          [
            p.id,
            { abc: abc.get(p.id) ?? 'C', xyz: xyzClassify(consumption.weekly.get(p.id) ?? []) },
          ] as const,
      ),
    );
    await products.saveClassifications(ctx.actor, classes);
    const matrix: Record<string, number> = {};
    for (const c of classes.values()) matrix[`${c.abc}${c.xyz}`] = (matrix[`${c.abc}${c.xyz}`] ?? 0) + 1;

    const dead = deadAndSlow(lines, {
      deadDays: ctx.org.deadStockDays,
      slowCoverDays: ctx.org.overstockDays,
      minValue: 2000,
    });
    const moves = rebalancing(lines);
    const drift = reorderDrift(
      lines.filter((l) => ['A', 'B'].includes(classes.get(l.productId)?.abc ?? 'C')),
    );

    const deadAlerts: AlertFinding[] = dead
      .filter((d) => d.kind === 'dead')
      .map((d) => ({
        type: 'DEAD_STOCK',
        dedupeKey: `DEAD_STOCK:${d.line.productId}:${d.line.warehouseId}`,
        severity: d.value > 20_000 ? 'MEDIUM' : 'LOW',
        priority: Math.min(55, 25 + Math.round(Math.log10(1 + d.value) * 6)),
        title: `${d.line.name} hasn’t sold at ${d.line.warehouseCode}`,
        message: `${d.line.onHand} on hand worth ${inr(d.value)}; ${d.line.daysSinceSale === null ? 'never sold here' : `no sale for ${d.line.daysSinceSale} days`}.`,
        explanation: d.markdownPrice
          ? `Clear it with a markdown to about ₹${d.markdownPrice} (${Math.round((d.markdownPct ?? 0) * 100)}% off), or move it where it still sells.`
          : 'Move it where it still sells, or return it to the supplier.',
        productId: d.line.productId,
        warehouseId: d.line.warehouseId,
        data: {
          sku: d.line.sku,
          warehouse: d.line.warehouseCode,
          onHand: d.line.onHand,
          value: Math.round(d.value),
          daysSinceSale: d.line.daysSinceSale,
        },
      }));
    await alerts.syncFindings(ctx.actor, ctx.runId, ['DEAD_STOCK'], deadAlerts, {
      quietHours: 14 * 24,
      action: 'alerts.dead_stock',
      label: 'Dead-stock review',
    });

    // Rule-based proposals: the largest opportunities of each kind, within the per-run limit.
    const proposals: ProposalDraft[] = [
      ...moves.slice(0, 2).map((m) => ({
        type: 'CREATE_TRANSFER' as const,
        payload: {
          fromWarehouseId: m.fromWarehouseId,
          toWarehouseId: m.toWarehouseId,
          lines: [{ productId: m.productId, quantity: m.quantity }],
          reason: 'Rebalancing excess stock',
        },
        rationale: `${m.fromCode} holds ${m.fromCoverBefore} days of cover while ${m.toCode} has ${m.toCoverBefore}; moving ${m.quantity} brings ${m.toCode} to ${m.toCoverAfter} days and keeps ${m.fromCode} at ${m.fromCoverAfter}.`,
      })),
      ...dead
        .filter((d) => d.kind === 'dead' && d.markdownPrice)
        .slice(0, 2)
        .map((d) => ({
          type: 'MARKDOWN_PRICE' as const,
          payload: {
            productId: d.line.productId,
            newPrice: (d.markdownPrice ?? 0).toFixed(2),
            reason: 'Clearing dead stock',
          },
          rationale: `${d.line.onHand} units (${inr(d.value)}) at ${d.line.warehouseCode} with no sale for ${d.line.daysSinceSale ?? 'over 90'} days. ₹${d.markdownPrice} stays above the ₹${d.line.costPrice} cost.`,
        })),
      ...drift.slice(0, 2).map((d) => ({
        type: 'UPDATE_REORDER_PARAMS' as const,
        payload: {
          productId: d.line.productId,
          warehouseId: d.line.warehouseId,
          reorderPoint: d.computed,
          safetyStock: Math.min(d.computed, d.line.safetyStock ?? 0),
          maxStock: d.line.maxStock !== null && d.line.maxStock < d.computed ? null : d.line.maxStock,
        },
        rationale: `Selling ${Math.round(d.line.avgDaily * 10) / 10}/day with a ${d.line.leadTimeDays}-day lead time puts the reorder point at ${d.computed}, not the configured ${d.configured}.`,
      })),
    ];

    const deadValue = dead.filter((d) => d.kind === 'dead').reduce((a, d) => a + d.value, 0);
    const slowValue = dead.filter((d) => d.kind === 'slow').reduce((a, d) => a + d.value, 0);
    const findings: RunFinding[] = [
      ...(deadValue
        ? [
            {
              title: `${inr(deadValue)} in dead stock`,
              detail: `${dead.filter((d) => d.kind === 'dead').length} positions with no sale in ${ctx.org.deadStockDays} days.`,
              severity: 'MEDIUM' as const,
            },
          ]
        : []),
      ...(slowValue
        ? [
            {
              title: `${inr(slowValue)} in slow stock`,
              detail: `Positions with more than ${ctx.org.overstockDays} days of cover.`,
              severity: 'LOW' as const,
            },
          ]
        : []),
      ...moves.slice(0, 3).map((m) => ({
        title: `Rebalance ${m.name}`,
        detail: `${m.quantity} from ${m.fromCode} to ${m.toCode} (${inr(m.value)}).`,
        severity: 'LOW' as const,
      })),
    ];
    const summary = `Classified ${classes.size} products; ${inr(deadValue)} dead and ${inr(slowValue)} slow stock, ${moves.length} rebalancing move${moves.length === 1 ? '' : 's'}, ${drift.length} reorder point${drift.length === 1 ? '' : 's'} to tune.`;
    return {
      headline: `${classes.size} classified · ${dead.length} dead/slow · ${moves.length} moves · ${drift.length} drifted`,
      facts: {
        abcXyz: matrix,
        deadAndSlow: dead.slice(0, 10).map((d) => ({
          kind: d.kind,
          productId: d.line.productId,
          sku: d.line.sku,
          name: d.line.name,
          warehouse: d.line.warehouseCode,
          onHand: d.line.onHand,
          value: Math.round(d.value),
          daysSinceSale: d.line.daysSinceSale,
          coverDays: d.coverDays,
          sellingPrice: d.line.sellingPrice,
          costPrice: d.line.costPrice,
          suggestedPrice: d.markdownPrice,
        })),
        rebalancing: moves.slice(0, 8),
        reorderDrift: drift.slice(0, 8).map((d) => ({
          productId: d.line.productId,
          sku: d.line.sku,
          name: d.line.name,
          warehouse: d.line.warehouseCode,
          configured: d.configured,
          computed: d.computed,
          safetyStock: d.line.safetyStock,
          maxStock: d.line.maxStock,
          perDay: Math.round(d.line.avgDaily * 10) / 10,
          leadTimeDays: d.line.leadTimeDays,
        })),
      },
      fingerprint: [
        ...dead.map((d) => `${d.kind}:${d.line.productId}:${d.line.warehouseId}`),
        ...moves.map((m) => `mv:${m.productId}:${m.fromWarehouseId}:${m.toWarehouseId}`),
        ...drift.map((d) => `rop:${d.line.productId}:${d.line.warehouseId}:${d.computed}`),
      ]
        .sort()
        .join('|'),
      nothingToDo: dead.length === 0 && moves.length === 0 && drift.length === 0,
      ruleBased: { summary, findings, proposals },
      state: { dead, moves, drift },
    };
  },
};
