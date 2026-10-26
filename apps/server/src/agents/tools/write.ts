import type { ActionType } from '@stockroom/shared';
import { z } from 'zod';
import type { ProposalOutcome } from '../../services/action.service';
import { defineTool, type ToolContext } from '../types';
import { resolveOne } from './read';

// Optional because small models often explain per line instead; the computed summary fills in.
const rationale = z
  .string()
  .max(1500)
  .optional()
  .describe('Why, citing the numbers from tool results (never invented ones)');
const ref = (what: string) => z.string().min(1).describe(`${what} id or code, from a tool result`);

/** Every write tool ends here: a proposal through ActionService, gated by the agent's autonomy. */
async function propose(ctx: ToolContext, type: ActionType, payload: unknown, why: string) {
  if (ctx.draft) return ctx.draft(type, payload, why);
  const outcome: ProposalOutcome = await ctx.services.actions.propose(
    ctx.actor,
    {
      type,
      payload,
      rationale: why,
      rationaleSource: 'AI',
      modelUsed: ctx.modelUsed,
      dataUsed: ctx.citations,
    },
    {
      agentKey: ctx.agentKey,
      runId: ctx.runId,
      autonomy: ctx.settings.autonomy,
      limits: ctx.settings.limits,
      createdThisRun: ctx.proposals.created,
    },
  );
  if (outcome.outcome === 'pending' || outcome.outcome === 'executed' || outcome.outcome === 'failed')
    ctx.proposals.created++;
  if (outcome.outcome === 'observed')
    ctx.proposals.observed.push({ type, title: outcome.title, summary: outcome.summary });
  return outcome;
}

export const writeTools = [
  defineTool({
    name: 'propose_purchase_order',
    kind: 'write',
    description:
      'Propose one purchase order to one supplier for one warehouse. People approve it (or it runs automatically in Act mode when low-risk). Quantities must respect the supplier MOQ and pack size; take them from compute_reorder_plan. unitCost defaults to the supplier catalog price.',
    input: z.object({
      supplier: ref('Supplier'),
      warehouse: ref('Warehouse'),
      lines: z
        .array(
          z.object({
            product: ref('Product (or SKU)'),
            quantity: z.number().int().min(1),
            unitCost: z.string().optional().describe('Only to override the catalog price'),
            rationale: z.string().max(400).optional(),
          }),
        )
        .min(1)
        .max(60),
      rationale,
    }),
    label: (a) => `Proposing a purchase order with ${a.lines.length} line(s)…`,
    run: async (ctx, a) => {
      const supplierId = await resolveOne(ctx, 'supplier', a.supplier);
      const warehouseId = await resolveOne(ctx, 'warehouse', a.warehouse);
      const ids = await ctx.services.planning.resolve(
        'product',
        a.lines.map((l) => l.product),
      );
      const options = await ctx.services.planning.supplierOptions([...ids.values()]);
      const lines = a.lines.map((l) => {
        const productId = ids.get(l.product.trim());
        if (!productId) throw new Error(`Unknown product “${l.product}”.`);
        const catalog = options.get(productId)?.find((o) => o.supplierId === supplierId);
        const unitCost = l.unitCost ?? (catalog ? catalog.unitCost.toFixed(2) : null);
        if (!unitCost) throw new Error(`${l.product} isn’t in this supplier’s catalog; give a unitCost.`);
        return { productId, quantity: l.quantity, unitCost, rationale: l.rationale ?? null };
      });
      const why = a.rationale ?? lines.flatMap((l) => (l.rationale ? [l.rationale] : [])).join(' ');
      return propose(ctx, 'CREATE_PURCHASE_ORDER', { supplierId, warehouseId, lines }, why);
    },
  }),

  defineTool({
    name: 'propose_transfer',
    kind: 'write',
    description:
      'Propose moving stock between two warehouses (excess at the source, shortage at the destination).',
    input: z.object({
      from: ref('Source warehouse'),
      to: ref('Destination warehouse'),
      lines: z
        .array(z.object({ product: ref('Product (or SKU)'), quantity: z.number().int().min(1) }))
        .min(1)
        .max(60),
      rationale,
    }),
    label: (a) => `Proposing a transfer of ${a.lines.length} item(s)…`,
    run: async (ctx, a) => {
      const fromWarehouseId = await resolveOne(ctx, 'warehouse', a.from);
      const toWarehouseId = await resolveOne(ctx, 'warehouse', a.to);
      const ids = await ctx.services.planning.resolve(
        'product',
        a.lines.map((l) => l.product),
      );
      const lines = a.lines.map((l) => {
        const productId = ids.get(l.product.trim());
        if (!productId) throw new Error(`Unknown product “${l.product}”.`);
        return { productId, quantity: l.quantity };
      });
      return propose(
        ctx,
        'CREATE_TRANSFER',
        { fromWarehouseId, toWarehouseId, lines, reason: null },
        a.rationale ?? '',
      );
    },
  }),

  defineTool({
    name: 'propose_reorder_params',
    kind: 'write',
    description: 'Propose new reorder point, safety stock and max stock for one product at one warehouse.',
    input: z.object({
      product: ref('Product (or SKU)'),
      warehouse: ref('Warehouse'),
      reorderPoint: z.number().int().min(0),
      safetyStock: z.number().int().min(0),
      maxStock: z.number().int().min(0).nullable(),
      rationale,
    }),
    label: () => 'Proposing new reorder settings…',
    run: async (ctx, a) =>
      propose(
        ctx,
        'UPDATE_REORDER_PARAMS',
        {
          productId: await resolveOne(ctx, 'product', a.product),
          warehouseId: await resolveOne(ctx, 'warehouse', a.warehouse),
          reorderPoint: a.reorderPoint,
          safetyStock: a.safetyStock,
          maxStock: a.maxStock,
        },
        a.rationale ?? '',
      ),
  }),

  defineTool({
    name: 'propose_cycle_count',
    kind: 'write',
    description: 'Propose counting specific products at one warehouse to verify recorded stock.',
    input: z.object({
      warehouse: ref('Warehouse'),
      products: z.array(ref('Product (or SKU)')).min(1).max(50),
      rationale,
    }),
    label: (a) => `Proposing a count of ${a.products.length} item(s)…`,
    run: async (ctx, a) => {
      const warehouseId = await resolveOne(ctx, 'warehouse', a.warehouse);
      const ids = await ctx.services.planning.resolve('product', a.products);
      const productIds = a.products.map((p) => {
        const id = ids.get(p.trim());
        if (!id) throw new Error(`Unknown product “${p}”.`);
        return id;
      });
      return propose(
        ctx,
        'CREATE_CYCLE_COUNT',
        { warehouseId, productIds, reason: (a.rationale ?? '').slice(0, 500) || null },
        a.rationale ?? '',
      );
    },
  }),

  defineTool({
    name: 'propose_markdown',
    kind: 'write',
    description: 'Propose a lower selling price for slow or dead stock. Never below the cost price.',
    input: z.object({
      product: ref('Product (or SKU)'),
      newPrice: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .describe('New selling price in rupees, e.g. "149.00"'),
      rationale,
    }),
    label: () => 'Proposing a markdown…',
    run: async (ctx, a) =>
      propose(
        ctx,
        'MARKDOWN_PRICE',
        {
          productId: await resolveOne(ctx, 'product', a.product),
          newPrice: a.newPrice,
          reason: (a.rationale ?? '').slice(0, 500) || null,
        },
        a.rationale ?? '',
      ),
  }),

  defineTool({
    name: 'propose_preferred_supplier_change',
    kind: 'write',
    description:
      'Propose making another (already linked, active) supplier the preferred source for a product.',
    input: z.object({ product: ref('Product (or SKU)'), supplier: ref('Supplier'), rationale }),
    label: () => 'Proposing a preferred-supplier change…',
    run: async (ctx, a) =>
      propose(
        ctx,
        'CHANGE_PREFERRED_SUPPLIER',
        {
          productId: await resolveOne(ctx, 'product', a.product),
          supplierId: await resolveOne(ctx, 'supplier', a.supplier),
        },
        a.rationale ?? '',
      ),
  }),
];
