import {
  ACTION_PAYLOAD_SCHEMAS,
  ACTION_TYPE_LABELS,
  AGENT_LABELS,
  type ActionApprove,
  type ActionCounts,
  type ActionDisplay,
  type ActionDto,
  type ActionImpact,
  type ActionPayloads,
  type ActionsQuery,
  type ActionType,
  type AgentKey,
  type AgentLimits,
  type Autonomy,
  type Citation,
  formatMoney,
  type ProductRef,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { toJson } from '../db/json';
import { inTransaction } from '../db/tx';
import { type Actor, actorRole, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, invalidTransition, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { CycleCountService } from './cycle-count.service';
import type { ProductService } from './product.service';
import type { PurchaseOrderService } from './purchase-order.service';
import type { SupplierService } from './supplier.service';
import { dec, getOrgSettings, iso, pageArgs, pageMeta, userNames } from './support';
import type { TransferService } from './transfer.service';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
const OPEN = ['PENDING', 'APPROVED'] as const;
/** A rejected proposal isn't made again for this long. */
const REJECT_QUIET_HOURS = 72;
const EXPIRES_DAYS = 7;

export interface ProposalInput {
  type: ActionType;
  payload: unknown;
  rationale: string;
  rationaleSource: 'AI' | 'RULE';
  modelUsed: string | null;
  dataUsed: Citation[];
}

export interface ProposalGate {
  agentKey: AgentKey;
  runId: string | null;
  autonomy: Autonomy;
  limits: AgentLimits;
  createdThisRun: number;
}

export type ProposalOutcome =
  | {
      outcome: 'pending' | 'executed' | 'failed';
      actionId: string;
      title: string;
      summary: string;
      impact: ActionImpact;
      riskLevel: RiskLevel;
      message: string;
    }
  | {
      outcome: 'observed';
      title: string;
      summary: string;
      impact: ActionImpact;
      riskLevel: RiskLevel;
      message: string;
    }
  | {
      outcome: 'duplicate' | 'recently_rejected' | 'limit_reached';
      actionId?: string;
      title: string;
      message: string;
    };

interface Prepared<T extends ActionType = ActionType> {
  type: T;
  payload: ActionPayloads[T];
  title: string;
  summary: string;
  impact: ActionImpact;
  riskLevel: RiskLevel;
  dedupeKey: string;
}

const inr = (n: { toString(): string } | number) => formatMoney(n.toString(), { compactDecimals: true });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const invalid = (message: string, details?: unknown) => new AppError('VALIDATION_ERROR', message, details);

interface PayloadLine {
  productId: string;
  quantity: number;
  unitCost?: string;
  rationale?: string | null;
}

const actionInclude = { agent: { select: { key: true } } } satisfies Prisma.AgentActionInclude;
type ActionRow = Prisma.AgentActionGetPayload<{ include: typeof actionInclude }>;

/**
 * Agent proposals. Write tools never change data directly: they call `propose()`, which validates
 * the payload, computes the impact and risk in code, deduplicates, and applies the agent's autonomy.
 * Approval executes the proposal through the normal services, as the agent on behalf of the approver.
 */
export class ActionService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly deps: {
      purchaseOrders: PurchaseOrderService;
      transfers: TransferService;
      products: ProductService;
      cycleCounts: CycleCountService;
      suppliers: SupplierService;
    },
  ) {}

  /* ── Preparing a payload (validation, impact, risk, dedupe key) ─────── */

  async prepare(type: ActionType, raw: unknown): Promise<Prepared> {
    const parsed = ACTION_PAYLOAD_SCHEMAS[type].safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`);
      throw invalid(`The ${ACTION_TYPE_LABELS[type].toLowerCase()} isn’t valid: ${issues.join('; ')}`, {
        issues,
      });
    }
    switch (type) {
      case 'CREATE_PURCHASE_ORDER':
        return this.preparePo(parsed.data as ActionPayloads['CREATE_PURCHASE_ORDER']);
      case 'CREATE_TRANSFER':
        return this.prepareTransfer(parsed.data as ActionPayloads['CREATE_TRANSFER']);
      case 'UPDATE_REORDER_PARAMS':
        return this.prepareReorder(parsed.data as ActionPayloads['UPDATE_REORDER_PARAMS']);
      case 'CREATE_CYCLE_COUNT':
        return this.prepareCount(parsed.data as ActionPayloads['CREATE_CYCLE_COUNT']);
      case 'MARKDOWN_PRICE':
        return this.prepareMarkdown(parsed.data as ActionPayloads['MARKDOWN_PRICE']);
      case 'CHANGE_PREFERRED_SUPPLIER':
        return this.preparePreferred(parsed.data as ActionPayloads['CHANGE_PREFERRED_SUPPLIER']);
    }
  }

  private async positions(warehouseId: string, productIds: string[]) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        available: number;
        on_order: number;
        avg_daily_demand: number;
        avg_cost: string;
      }>
    >`
      SELECT product_id, available, on_order, avg_daily_demand, avg_cost::text
      FROM v_stock_positions
      WHERE warehouse_id = ${warehouseId}::uuid AND product_id = ANY(${productIds}::uuid[])`;
    return new Map(rows.map((r) => [r.product_id, r]));
  }

  private async activeProducts(ids: string[]) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        name: true,
        status: true,
        taxRate: true,
        costPrice: true,
        sellingPrice: true,
        leadTimeDays: true,
        preferredSupplierId: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length)
      throw invalid(`Unknown product id(s): ${missing.join(', ')}. Use ids from tool results.`);
    const inactive = products.filter((p) => p.status !== 'ACTIVE');
    if (inactive.length)
      throw invalid(
        `${inactive.map((p) => p.sku).join(', ')} ${inactive.length === 1 ? 'isn’t' : 'aren’t'} active.`,
      );
    return byId;
  }

  private async activeWarehouse(id: string, label = 'warehouse') {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      select: { id: true, code: true, isActive: true },
    });
    if (!wh?.isActive) throw invalid(`Unknown or inactive ${label}: ${id}.`);
    return wh;
  }

  private async preparePo(p: ActionPayloads['CREATE_PURCHASE_ORDER']): Promise<Prepared> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: p.supplierId } });
    if (!supplier?.isActive) throw invalid(`Unknown or inactive supplier: ${p.supplierId}.`);
    const wh = await this.activeWarehouse(p.warehouseId);
    const ids = p.lines.map((l) => l.productId);
    const products = await this.activeProducts(ids);
    const links = new Map(
      (
        await this.prisma.supplierProduct.findMany({
          where: { supplierId: supplier.id, productId: { in: ids } },
        })
      ).map((l) => [l.productId, l]),
    );
    const pos = await this.positions(wh.id, ids);
    const settings = await getOrgSettings(this.prisma);

    const notes: string[] = [];
    const problems: string[] = [];
    let cost = dec(0);
    let units = 0;
    let before: number | null = null;
    let after: number | null = null;
    let prevented = 0;
    let longCover = false;
    for (const line of p.lines) {
      const product = products.get(line.productId);
      if (!product) continue;
      const link = links.get(line.productId);
      if (link) {
        if (line.quantity < link.moq)
          problems.push(`${product.sku}: at least ${link.moq} (the supplier’s minimum order)`);
        else if (line.quantity % link.packSize !== 0)
          problems.push(`${product.sku}: a multiple of the pack size ${link.packSize}`);
        const drift = dec(line.unitCost).minus(link.unitCost).div(link.unitCost).abs();
        if (drift.gt(0.15))
          notes.push(
            `${product.sku} unit cost ${inr(line.unitCost)} differs from the catalog price ${inr(link.unitCost)}`,
          );
      } else {
        notes.push(`${product.sku} isn’t in ${supplier.name}’s catalog`);
      }
      cost = cost.plus(dec(line.unitCost).times(line.quantity).times(dec(product.taxRate).div(100).plus(1)));
      units += line.quantity;
      const s = pos.get(line.productId);
      const d = s?.avg_daily_demand ?? 0;
      if (d > 0) {
        const position = (s?.available ?? 0) + (s?.on_order ?? 0);
        const lead = link?.leadTimeDays ?? product.leadTimeDays ?? 7;
        const b = (s?.available ?? 0) / d;
        const a = (position + line.quantity) / d;
        before = before === null ? b : Math.min(before, b);
        after = after === null ? a : Math.min(after, a);
        if (position / d < lead && a >= lead) prevented++;
        if (line.quantity / d > 180) longCover = true;
      }
    }
    if (problems.length) throw invalid(`Adjust the quantities: ${problems.join('; ')}.`);

    const threshold = settings.poApprovalThresholdInr;
    const riskLevel: RiskLevel =
      cost.gt(threshold * 2) || longCover ? 'HIGH' : cost.gte(threshold) || notes.length ? 'MEDIUM' : 'LOW';
    if (longCover) notes.push('At least one line covers more than 180 days of demand');
    if (cost.gte(threshold)) notes.push(`Above the ${inr(threshold)} approval threshold`);
    const n = p.lines.length;
    return {
      type: 'CREATE_PURCHASE_ORDER',
      payload: p,
      title: `Order ${plural(n, 'item')} from ${supplier.name} for ${wh.code}`,
      summary: `${inr(cost.toFixed(2))} for ${wh.code}${prevented ? ` · prevents ${plural(prevented, 'stockout')}` : ` · ${units.toLocaleString('en-IN')} units`}`,
      impact: {
        cost: cost.toFixed(2),
        units,
        daysOfCoverBefore: before === null ? null : round1(before),
        daysOfCoverAfter: after === null ? null : round1(after),
        stockoutsPrevented: prevented,
        notes,
      },
      riskLevel,
      dedupeKey: `PO:${supplier.id}:${wh.id}`,
    };
  }

  private async prepareTransfer(p: ActionPayloads['CREATE_TRANSFER']): Promise<Prepared> {
    const from = await this.activeWarehouse(p.fromWarehouseId, 'source warehouse');
    const to = await this.activeWarehouse(p.toWarehouseId, 'destination warehouse');
    const ids = p.lines.map((l) => l.productId);
    const products = await this.activeProducts(ids);
    const src = await this.positions(from.id, ids);
    const dst = await this.positions(to.id, ids);
    const short = p.lines.filter((l) => (src.get(l.productId)?.available ?? 0) < l.quantity);
    if (short.length)
      throw invalid(
        `Not enough available at ${from.code}: ${short
          .map((l) => `${products.get(l.productId)?.sku} has ${src.get(l.productId)?.available ?? 0}`)
          .join('; ')}.`,
      );
    let value = dec(0);
    let units = 0;
    let riskLevel: RiskLevel = 'LOW';
    let before: number | null = null;
    let after: number | null = null;
    const notes: string[] = [];
    for (const l of p.lines) {
      const s = src.get(l.productId);
      const d = dst.get(l.productId);
      value = value.plus(dec(s?.avg_cost).times(l.quantity));
      units += l.quantity;
      const lead = products.get(l.productId)?.leadTimeDays ?? 7;
      const srcDemand = s?.avg_daily_demand ?? 0;
      if (srcDemand > 0 && ((s?.available ?? 0) - l.quantity) / srcDemand < lead) {
        riskLevel = 'MEDIUM';
        notes.push(
          `${products.get(l.productId)?.sku} leaves ${from.code} with less than ${lead} days of cover`,
        );
      }
      const dd = d?.avg_daily_demand ?? 0;
      if (dd > 0) {
        const b = (d?.available ?? 0) / dd;
        const a = ((d?.available ?? 0) + l.quantity) / dd;
        before = before === null ? b : Math.min(before, b);
        after = after === null ? a : Math.min(after, a);
      }
    }
    return {
      type: 'CREATE_TRANSFER',
      payload: p,
      title: `Move ${plural(p.lines.length, 'item')} ${from.code} → ${to.code}`,
      summary: `${units.toLocaleString('en-IN')} units worth ${inr(value.toFixed(2))}`,
      impact: {
        units,
        valueRecovered: value.toFixed(2),
        daysOfCoverBefore: before === null ? null : round1(before),
        daysOfCoverAfter: after === null ? null : round1(after),
        notes,
      },
      riskLevel,
      dedupeKey: `TRF:${from.id}:${to.id}`,
    };
  }

  private async currentParams(productId: string, warehouseId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ reorder_point: number | null; safety_stock: number | null; max_stock: number | null }>
    >`
      SELECT reorder_point, safety_stock, max_stock FROM v_stock_positions
      WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid`;
    return rows[0] ?? { reorder_point: null, safety_stock: null, max_stock: null };
  }

  private async prepareReorder(p: ActionPayloads['UPDATE_REORDER_PARAMS']): Promise<Prepared> {
    const products = await this.activeProducts([p.productId]);
    const product = products.get(p.productId);
    const wh = await this.activeWarehouse(p.warehouseId);
    const cur = await this.currentParams(p.productId, p.warehouseId);
    const change = (a: number | null, b: number | null) =>
      a === null || b === null ? (a === b ? 0 : 1) : Math.abs(b - a) / Math.max(1, a);
    const biggest = Math.max(
      change(cur.reorder_point, p.reorderPoint),
      change(cur.safety_stock, p.safetyStock),
      change(cur.max_stock, p.maxStock),
    );
    if (biggest === 0) throw invalid('These are already the current settings.');
    const fmt = (n: number | null) => (n === null ? 'not set' : n.toLocaleString('en-IN'));
    return {
      type: 'UPDATE_REORDER_PARAMS',
      payload: p,
      title: `Update reorder settings for ${product?.name} at ${wh.code}`,
      summary: `Reorder point ${fmt(cur.reorder_point)} → ${fmt(p.reorderPoint)}, safety stock ${fmt(cur.safety_stock)} → ${fmt(p.safetyStock)}`,
      impact: { notes: biggest > 0.3 ? ['Changes a setting by more than 30 %'] : [] },
      riskLevel: biggest > 0.3 ? 'MEDIUM' : 'LOW',
      dedupeKey: `ROP:${p.productId}:${p.warehouseId}`,
    };
  }

  private async prepareCount(p: ActionPayloads['CREATE_CYCLE_COUNT']): Promise<Prepared> {
    const wh = await this.activeWarehouse(p.warehouseId);
    await this.activeProducts(p.productIds);
    return {
      type: 'CREATE_CYCLE_COUNT',
      payload: p,
      title: `Count ${plural(p.productIds.length, 'item')} at ${wh.code}`,
      summary: p.reason ?? 'Verify recorded stock against the shelf',
      impact: { units: null, notes: [] },
      riskLevel: 'LOW',
      dedupeKey: `COUNT:${wh.id}`,
    };
  }

  private async prepareMarkdown(p: ActionPayloads['MARKDOWN_PRICE']): Promise<Prepared> {
    const product = (await this.activeProducts([p.productId])).get(p.productId);
    if (!product) throw notFound('Product');
    const price = dec(p.newPrice);
    if (price.gte(product.sellingPrice))
      throw invalid(`A markdown must be below the current price ${inr(product.sellingPrice)}.`);
    if (price.lt(product.costPrice))
      throw invalid(`Don’t go below the cost price ${inr(product.costPrice)}.`);
    const onHand = await this.prisma.stockLevel.aggregate({
      where: { productId: p.productId },
      _sum: { onHand: true },
    });
    const qty = onHand._sum.onHand ?? 0;
    const drop = dec(product.sellingPrice).minus(price).div(product.sellingPrice).toNumber();
    return {
      type: 'MARKDOWN_PRICE',
      payload: p,
      title: `Mark down ${product.name} by ${Math.round(drop * 100)}%`,
      summary: `${inr(product.sellingPrice)} → ${inr(price.toFixed(2))} on ${qty.toLocaleString('en-IN')} units`,
      impact: { units: qty, valueRecovered: price.times(qty).toFixed(2), notes: [] },
      riskLevel: drop > 0.25 ? 'HIGH' : 'MEDIUM',
      dedupeKey: `MD:${p.productId}`,
    };
  }

  private async preparePreferred(p: ActionPayloads['CHANGE_PREFERRED_SUPPLIER']): Promise<Prepared> {
    const product = (await this.activeProducts([p.productId])).get(p.productId);
    const link = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: p.supplierId, productId: p.productId } },
      include: { supplier: { select: { name: true, isActive: true } } },
    });
    if (!link?.isActive || !link.supplier.isActive)
      throw invalid('That supplier doesn’t actively supply this product.');
    if (product?.preferredSupplierId === p.supplierId)
      throw invalid(`${link.supplier.name} is already preferred.`);
    return {
      type: 'CHANGE_PREFERRED_SUPPLIER',
      payload: p,
      title: `Prefer ${link.supplier.name} for ${product?.name}`,
      summary: `${inr(link.unitCost)} per unit, ${link.leadTimeDays}-day lead time`,
      impact: { notes: [] },
      riskLevel: 'MEDIUM',
      dedupeKey: `PREF:${p.productId}`,
    };
  }

  /* ── Proposing ───────────────────────────────────────────────────────── */

  async propose(actor: Actor, input: ProposalInput, gate: ProposalGate): Promise<ProposalOutcome> {
    const prepared = await this.prepare(input.type, input.payload);
    const open = await this.prisma.agentAction.findFirst({
      where: { dedupeKey: prepared.dedupeKey, status: { in: [...OPEN] } },
      select: { id: true, title: true },
    });
    if (open)
      return {
        outcome: 'duplicate',
        actionId: open.id,
        title: prepared.title,
        message: `A matching proposal is already waiting (“${open.title}”). Don’t propose it again.`,
      };
    if (prepared.type === 'CREATE_PURCHASE_ORDER') {
      const overlap = await this.openPoProducts(
        (prepared.payload as ActionPayloads['CREATE_PURCHASE_ORDER']).warehouseId,
      );
      const clash = (prepared.payload as ActionPayloads['CREATE_PURCHASE_ORDER']).lines.filter((l) =>
        overlap.has(l.productId),
      );
      if (clash.length)
        return {
          outcome: 'duplicate',
          title: prepared.title,
          message: `${clash.length} product(s) are already in another pending purchase-order proposal for this warehouse. Leave them out.`,
        };
    }
    const rejected = await this.prisma.agentAction.findFirst({
      where: {
        dedupeKey: prepared.dedupeKey,
        status: 'REJECTED',
        decidedAt: { gte: new Date(Date.now() - REJECT_QUIET_HOURS * 3_600_000) },
      },
      select: { decisionReason: true },
      orderBy: { decidedAt: 'desc' },
    });
    if (rejected)
      return {
        outcome: 'recently_rejected',
        title: prepared.title,
        message: `A person rejected this recently: “${rejected.decisionReason ?? 'no reason given'}”. Don’t propose it again yet.`,
      };
    if (gate.createdThisRun >= gate.limits.maxActionsPerRun)
      return {
        outcome: 'limit_reached',
        title: prepared.title,
        message: `This run already made ${gate.createdThisRun} proposals (the limit). Mention the rest in your findings.`,
      };
    if (gate.autonomy === 'OBSERVE')
      return {
        outcome: 'observed',
        title: prepared.title,
        summary: prepared.summary,
        impact: prepared.impact,
        riskLevel: prepared.riskLevel,
        message: 'Observe mode: recorded as a finding, not queued for approval.',
      };

    const autoExecute =
      gate.autonomy === 'ACT' &&
      prepared.riskLevel === 'LOW' &&
      (prepared.type !== 'CREATE_PURCHASE_ORDER' ||
        dec(prepared.impact.cost ?? 0).lte(gate.limits.maxPoValueInr));

    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const agent = await tx.agentDefinition.findUnique({
        where: { key: gate.agentKey },
        select: { id: true },
      });
      if (!agent) throw notFound('Agent');
      const row = await tx.agentAction.create({
        data: {
          runId: gate.runId,
          agentId: agent.id,
          type: prepared.type,
          status: autoExecute ? 'APPROVED' : 'PENDING',
          title: prepared.title,
          summary: prepared.summary,
          rationale: input.rationale.trim().slice(0, 4000) || prepared.summary,
          rationaleSource: input.rationaleSource,
          modelUsed: input.modelUsed,
          payload: toJson(prepared.payload),
          expectedImpact: toJson(prepared.impact),
          dataUsed: toJson(input.dataUsed.slice(0, 30)),
          riskLevel: prepared.riskLevel,
          dedupeKey: prepared.dedupeKey,
          autoExecuted: autoExecute,
          decidedAt: autoExecute ? new Date() : null,
          decisionReason: autoExecute ? 'Executed automatically (Act mode, low risk, within limits)' : null,
          expiresAt: new Date(Date.now() + EXPIRES_DAYS * 86_400_000),
        },
        select: { id: true, status: true },
      });
      await writeAudit(tx, actor, {
        action: 'action.propose',
        entityType: 'AgentAction',
        entityId: row.id,
        summary: `Proposed: ${prepared.title}`,
        after: {
          type: prepared.type,
          payload: prepared.payload,
          impact: prepared.impact,
          risk: prepared.riskLevel,
        },
      });
      emit('action.created', {
        actionId: row.id,
        agentKey: gate.agentKey,
        type: prepared.type,
        status: row.status,
      });
      return row.id;
    });

    if (autoExecute) {
      const done = await this.execute(id, actor);
      return {
        outcome: done.status === 'EXECUTED' ? 'executed' : 'failed',
        actionId: id,
        title: prepared.title,
        summary: prepared.summary,
        impact: prepared.impact,
        riskLevel: prepared.riskLevel,
        message:
          done.status === 'EXECUTED'
            ? `Done automatically${typeof done.result?.number === 'string' ? `: ${done.result.number}` : ''}.`
            : `Tried to execute automatically but it failed: ${done.error ?? 'unknown error'}`,
      };
    }
    return {
      outcome: 'pending',
      actionId: id,
      title: prepared.title,
      summary: prepared.summary,
      impact: prepared.impact,
      riskLevel: prepared.riskLevel,
      message: 'Queued for approval.',
    };
  }

  /**
   * A change drafted in the Assistant and confirmed by a person: recorded as an approved action and
   * executed as that person (their permissions apply), so it shows up in history and the audit log.
   */
  async confirmFromChat(
    actor: Actor,
    input: {
      type: ActionType;
      payload: unknown;
      rationale: string;
      modelUsed: string | null;
      dataUsed: Citation[];
      runId: string | null;
    },
  ): Promise<ActionDto> {
    if (actor.type !== 'user') throw invalid('Only a signed-in person can confirm a change.');
    const prepared = await this.prepare(input.type, input.payload);
    const open = await this.prisma.agentAction.findFirst({
      where: { dedupeKey: prepared.dedupeKey, status: { in: [...OPEN] } },
      select: { title: true },
    });
    if (open)
      throw new AppError(
        'CONFLICT',
        `A matching proposal is already waiting in Approvals (“${open.title}”). Approve it there instead.`,
      );
    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const agent = await tx.agentDefinition.findUnique({
        where: { key: 'assistant' },
        select: { id: true },
      });
      if (!agent) throw notFound('Agent');
      const row = await tx.agentAction.create({
        data: {
          runId: input.runId,
          agentId: agent.id,
          type: prepared.type,
          status: 'APPROVED',
          title: prepared.title,
          summary: prepared.summary,
          rationale: input.rationale.trim().slice(0, 4000) || prepared.summary,
          rationaleSource: 'AI',
          modelUsed: input.modelUsed,
          payload: toJson(prepared.payload),
          expectedImpact: toJson(prepared.impact),
          dataUsed: toJson(input.dataUsed.slice(0, 30)),
          riskLevel: prepared.riskLevel,
          dedupeKey: prepared.dedupeKey,
          decidedById: actor.userId,
          decidedAt: new Date(),
          decisionReason: 'Confirmed in the Assistant',
        },
        select: { id: true },
      });
      await writeAudit(tx, actor, {
        action: 'action.confirm',
        entityType: 'AgentAction',
        entityId: row.id,
        summary: `Confirmed in the Assistant: ${prepared.title}`,
        after: { type: prepared.type, payload: prepared.payload },
      });
      emit('action.created', {
        actionId: row.id,
        agentKey: 'assistant',
        type: prepared.type,
        status: 'APPROVED',
      });
      return row.id;
    });
    return this.execute(id, actor, actor);
  }

  /** Products already in an open purchase-order proposal (per warehouse), so planners don't double up. */
  async openPoProducts(warehouseId?: string): Promise<Set<string>> {
    const rows = await this.prisma.agentAction.findMany({
      where: { type: 'CREATE_PURCHASE_ORDER', status: { in: [...OPEN] } },
      select: { payload: true, editedPayload: true },
    });
    const out = new Set<string>();
    for (const r of rows) {
      const p = (r.editedPayload ?? r.payload) as ActionPayloads['CREATE_PURCHASE_ORDER'];
      if (warehouseId && p.warehouseId !== warehouseId) continue;
      for (const l of p.lines ?? []) out.add(warehouseId ? l.productId : `${l.productId}|${p.warehouseId}`);
    }
    return out;
  }

  /* ── Deciding ────────────────────────────────────────────────────────── */

  async approve(actor: Actor, id: string, input: ActionApprove = {}): Promise<ActionDto> {
    assertCan(actor, 'actions.approve', 'Only managers and admins can approve agent proposals.');
    const row = await this.prisma.agentAction.findUnique({ where: { id }, include: actionInclude });
    if (!row) throw notFound('Proposal');
    if (row.status !== 'PENDING') throw invalidTransition(row.status, 'APPROVED', 'This proposal');
    const edited = input.payload ? await this.prepare(row.type, input.payload) : null;
    const userId = actor.type === 'user' ? actor.userId : null;
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const updated = await tx.agentAction.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: userId,
          decidedAt: new Date(),
          decisionReason: input.reason?.trim() || null,
          ...(edited
            ? {
                editedPayload: toJson(edited.payload),
                expectedImpact: toJson(edited.impact),
                riskLevel: edited.riskLevel,
                summary: edited.summary,
              }
            : {}),
        },
      });
      if (!updated.count) throw invalidTransition('decided', 'APPROVED', 'This proposal');
      await writeAudit(tx, actor, {
        action: edited ? 'action.edit_approve' : 'action.approve',
        entityType: 'AgentAction',
        entityId: id,
        summary: `${edited ? 'Edited and approved' : 'Approved'}: ${row.title}`,
        before: edited ? { payload: row.payload } : { status: row.status },
        after: edited ? { payload: edited.payload } : { status: 'APPROVED' },
      });
      emit('action.decided', { actionId: id, status: 'APPROVED' });
    });
    const role = actorRole(actor);
    const executor: Actor = {
      type: 'agent',
      agentKey: row.agent.key,
      runId: row.runId,
      onBehalfOf: userId && role ? { userId, role } : undefined,
    };
    return this.execute(id, executor, actor);
  }

  async reject(actor: Actor, id: string, reason: string): Promise<ActionDto> {
    assertCan(actor, 'actions.approve', 'Only managers and admins can reject agent proposals.');
    const row = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!row) throw notFound('Proposal');
    if (row.status !== 'PENDING') throw invalidTransition(row.status, 'REJECTED', 'This proposal');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      await tx.agentAction.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedById: actor.type === 'user' ? actor.userId : null,
          decidedAt: new Date(),
          decisionReason: reason.trim(),
        },
      });
      await writeAudit(tx, actor, {
        action: 'action.reject',
        entityType: 'AgentAction',
        entityId: id,
        summary: `Rejected: ${row.title} — ${reason.trim()}`,
        before: { status: row.status },
        after: { status: 'REJECTED', reason: reason.trim() },
      });
      emit('action.decided', { actionId: id, status: 'REJECTED' });
    });
    return this.get(id);
  }

  /** Runs an approved proposal through the normal services. Failures are recorded on the proposal. */
  private async execute(id: string, actor: Actor, approver?: Actor): Promise<ActionDto> {
    const row = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!row || row.status !== 'APPROVED')
      throw invalidTransition(row?.status ?? 'missing', 'EXECUTED', 'This proposal');
    const payload = (row.editedPayload ?? row.payload) as Record<string, unknown>;
    let result: Record<string, unknown> | null = null;
    let error: string | null = null;
    try {
      result = await this.run(row.type, payload, actor, row, approver);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unexpected error';
    }
    await inTransaction(this.prisma, this.bus, async (tx: Tx, emit) => {
      await tx.agentAction.update({
        where: { id },
        data: error
          ? { status: 'FAILED', error: { message: error } }
          : { status: 'EXECUTED', executedAt: new Date(), result: toJson(result) },
      });
      await writeAudit(tx, actor, {
        action: error ? 'action.failed' : 'action.execute',
        entityType: 'AgentAction',
        entityId: id,
        summary: error ? `Couldn’t execute “${row.title}”: ${error}` : `Executed: ${row.title}`,
        after: error ? { error } : result,
      });
      emit('action.executed', { actionId: id, status: error ? 'FAILED' : 'EXECUTED', result });
    });
    return this.get(id);
  }

  private async run(
    type: ActionType,
    raw: Record<string, unknown>,
    actor: Actor,
    row: { id: string; rationale: string },
    approver?: Actor,
  ): Promise<Record<string, unknown>> {
    switch (type) {
      case 'CREATE_PURCHASE_ORDER': {
        const p = raw as ActionPayloads['CREATE_PURCHASE_ORDER'];
        let po = await this.deps.purchaseOrders.create(
          actor,
          {
            supplierId: p.supplierId,
            warehouseId: p.warehouseId,
            expectedDate: p.expectedDate ?? null,
            notes: p.notes ?? null,
            lines: p.lines.map((l) => ({
              productId: l.productId,
              quantityOrdered: l.quantity,
              unitCost: l.unitCost,
            })),
            submit: true,
          },
          {
            rationale: row.rationale,
            lineRationales: new Map(
              p.lines.filter((l) => l.rationale).map((l) => [l.productId, l.rationale ?? '']),
            ),
            agentActionId: row.id,
          },
        );
        // Approving the proposal is the purchase approval when the approver may approve POs.
        if (po.status === 'PENDING_APPROVAL' && approver && actorCanApprovePo(approver))
          po = await this.deps.purchaseOrders.approve(approver, po.id);
        return { entity: 'PurchaseOrder', id: po.id, number: po.number, status: po.status };
      }
      case 'CREATE_TRANSFER': {
        const p = raw as ActionPayloads['CREATE_TRANSFER'];
        const t = await this.deps.transfers.create(
          actor,
          {
            fromWarehouseId: p.fromWarehouseId,
            toWarehouseId: p.toWarehouseId,
            reason: p.reason ?? null,
            lines: p.lines,
          },
          { agentActionId: row.id },
        );
        return { entity: 'Transfer', id: t.id, number: t.number, status: t.status };
      }
      case 'UPDATE_REORDER_PARAMS': {
        const p = raw as ActionPayloads['UPDATE_REORDER_PARAMS'];
        await this.deps.products.updateStockParams(actor, p.productId, p.warehouseId, {
          reorderPoint: p.reorderPoint,
          safetyStock: p.safetyStock,
          maxStock: p.maxStock,
        });
        return { entity: 'Product', id: p.productId };
      }
      case 'CREATE_CYCLE_COUNT': {
        const p = raw as ActionPayloads['CREATE_CYCLE_COUNT'];
        const c = await this.deps.cycleCounts.create(
          actor,
          {
            warehouseId: p.warehouseId,
            productIds: p.productIds,
            reason: p.reason ?? null,
            dueDate: p.dueDate ?? null,
          },
          { agentActionId: row.id },
        );
        return { entity: 'CycleCount', id: c.id, number: c.number, status: c.status };
      }
      case 'MARKDOWN_PRICE': {
        const p = raw as ActionPayloads['MARKDOWN_PRICE'];
        await this.deps.products.setSellingPrice(actor, p.productId, p.newPrice, p.reason ?? row.rationale);
        return { entity: 'Product', id: p.productId };
      }
      case 'CHANGE_PREFERRED_SUPPLIER': {
        const p = raw as ActionPayloads['CHANGE_PREFERRED_SUPPLIER'];
        await this.deps.suppliers.setPreferred(actor, p.productId, p.supplierId);
        return { entity: 'Product', id: p.productId };
      }
    }
  }

  /** Pending proposals past their expiry date. */
  async expireStale(): Promise<number> {
    const stale = await this.prisma.agentAction.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      select: { id: true },
    });
    if (!stale.length) return 0;
    await this.prisma.agentAction.updateMany({
      where: { id: { in: stale.map((s) => s.id) }, status: 'PENDING' },
      data: { status: 'EXPIRED', decisionReason: `No decision within ${EXPIRES_DAYS} days` },
    });
    for (const s of stale) this.bus.emit('action.decided', { actionId: s.id, status: 'EXPIRED' });
    return stale.length;
  }

  /** How people responded to this agent's recent proposals: fed back into its next run. */
  async recentDecisions(agentKey: AgentKey, limit = 10) {
    const rows = await this.prisma.agentAction.findMany({
      where: { agent: { key: agentKey }, status: { in: ['EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED'] } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        title: true,
        status: true,
        decisionReason: true,
        autoExecuted: true,
        payload: true,
        editedPayload: true,
        error: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      title: r.title,
      outcome: r.autoExecuted
        ? 'auto-executed'
        : r.editedPayload
          ? 'edited, then approved'
          : r.status.toLowerCase(),
      reason: r.decisionReason ?? (r.error as { message?: string } | null)?.message ?? null,
      edits: r.editedPayload ? describeEdits(r.payload, r.editedPayload) : null,
      at: r.updatedAt.toISOString().slice(0, 10),
    }));
  }

  /* ── Reading ─────────────────────────────────────────────────────────── */

  async list(q: ActionsQuery) {
    const where: Prisma.AgentActionWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      type: q.type?.length ? { in: q.type } : undefined,
      agent: q.agentKey ? { key: q.agentKey } : undefined,
      runId: q.runId,
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { summary: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.agentAction.count({ where }),
      this.prisma.agentAction.findMany({
        where,
        include: actionInclude,
        orderBy: [{ createdAt: 'desc' }],
        ...pageArgs(q),
      }),
    ]);
    return { data: await this.toDto(rows), meta: pageMeta(q, total) };
  }

  async get(id: string): Promise<ActionDto> {
    const row = await this.prisma.agentAction.findUnique({ where: { id }, include: actionInclude });
    if (!row) throw notFound('Proposal');
    const [dto] = await this.toDto([row]);
    if (!dto) throw notFound('Proposal');
    return dto;
  }

  async counts(): Promise<ActionCounts> {
    const rows = await this.prisma.agentAction.groupBy({
      by: ['agentId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    const agents = await this.prisma.agentDefinition.findMany({ select: { id: true, key: true } });
    const keyById = new Map(agents.map((a) => [a.id, a.key]));
    const byAgent: Record<string, number> = {};
    let pending = 0;
    for (const r of rows) {
      byAgent[keyById.get(r.agentId) ?? 'unknown'] = r._count._all;
      pending += r._count._all;
    }
    return { pending, byAgent };
  }

  /** Names and current numbers for a payload, as a person needs to see them (no writes). */
  async preview(type: ActionType, payload: unknown): Promise<ActionDisplay> {
    const [d] = await this.displays([{ type, payload: payload as Record<string, unknown> }]);
    return d as ActionDisplay;
  }

  private async displays(
    items: Array<{ type: ActionType; payload: Record<string, unknown> }>,
  ): Promise<ActionDisplay[]> {
    const payloads = items.map((i) => i.payload);
    const productIds = new Set<string>();
    const warehouseIds = new Set<string>();
    const supplierIds = new Set<string>();
    for (const p of payloads) {
      for (const k of ['warehouseId', 'fromWarehouseId', 'toWarehouseId'])
        if (typeof p[k] === 'string') warehouseIds.add(p[k]);
      if (typeof p.supplierId === 'string') supplierIds.add(p.supplierId);
      if (typeof p.productId === 'string') productIds.add(p.productId);
      for (const l of (p.lines as Array<{ productId: string }> | undefined) ?? [])
        productIds.add(l.productId);
      for (const pid of (p.productIds as string[] | undefined) ?? []) productIds.add(pid);
    }
    const [products, warehouses, suppliers, levels] = await Promise.all([
      productIds.size
        ? this.prisma.product.findMany({
            where: { id: { in: [...productIds] } },
            select: {
              id: true,
              sku: true,
              name: true,
              trackExpiry: true,
              sellingPrice: true,
              preferredSupplierId: true,
              unit: { select: { code: true } },
            },
          })
        : [],
      warehouseIds.size
        ? this.prisma.warehouse.findMany({
            where: { id: { in: [...warehouseIds] } },
            select: { id: true, code: true, name: true },
          })
        : [],
      supplierIds.size
        ? this.prisma.supplier.findMany({
            where: { id: { in: [...supplierIds] } },
            select: { id: true, name: true },
          })
        : [],
      productIds.size && warehouseIds.size
        ? this.prisma.stockLevel.findMany({
            where: { productId: { in: [...productIds] }, warehouseId: { in: [...warehouseIds] } },
            select: {
              productId: true,
              warehouseId: true,
              onHand: true,
              reserved: true,
              reorderPoint: true,
              safetyStock: true,
              maxStock: true,
            },
          })
        : [],
    ]);
    const prod = new Map(products.map((p) => [p.id, p]));
    const wh = new Map(warehouses.map((w) => [w.id, w]));
    const sup = new Map(suppliers.map((s) => [s.id, s]));
    const level = new Map(levels.map((l) => [`${l.productId}|${l.warehouseId}`, l]));
    const preferredIds = [
      ...new Set(products.map((p) => p.preferredSupplierId).filter((x): x is string => !!x)),
    ];
    const preferred = preferredIds.length
      ? new Map(
          (
            await this.prisma.supplier.findMany({
              where: { id: { in: preferredIds } },
              select: { id: true, name: true },
            })
          ).map((s) => [s.id, s.name]),
        )
      : new Map<string, string>();

    const ref = (id: string): ProductRef => {
      const p = prod.get(id);
      return {
        id,
        sku: p?.sku ?? '—',
        name: p?.name ?? 'Unknown product',
        unit: p?.unit.code ?? '',
        trackExpiry: p?.trackExpiry ?? false,
      };
    };
    const whRef = (id: unknown) => (typeof id === 'string' ? (wh.get(id) ?? null) : null);

    return items.map((r, i) => {
      const p = payloads[i] ?? {};
      const atWh = (typeof p.warehouseId === 'string' ? p.warehouseId : p.fromWarehouseId) as
        string | undefined;
      const display: ActionDisplay = {
        supplier: typeof p.supplierId === 'string' ? (sup.get(p.supplierId) ?? null) : null,
        warehouse: whRef(p.warehouseId),
        fromWarehouse: whRef(p.fromWarehouseId),
        toWarehouse: whRef(p.toWarehouseId),
        product: typeof p.productId === 'string' ? ref(p.productId) : null,
        lines: [
          ...((p.lines as PayloadLine[] | undefined) ?? []),
          ...((p.productIds as string[] | undefined) ?? []).map((productId): PayloadLine => ({
            productId,
            quantity: 0,
          })),
        ].map((l) => {
          const lv = atWh ? level.get(`${l.productId}|${atWh}`) : undefined;
          return {
            product: ref(l.productId),
            quantity: l.quantity,
            unitCost: l.unitCost ? dec(l.unitCost).toFixed(2) : null,
            lineTotal: l.unitCost ? dec(l.unitCost).times(l.quantity).toFixed(2) : null,
            rationale: l.rationale ?? null,
            available: lv ? lv.onHand - lv.reserved : null,
          };
        }),
        changes: [],
      };
      if (r.type === 'UPDATE_REORDER_PARAMS') {
        const lv = level.get(`${String(p.productId)}|${String(p.warehouseId)}`);
        const f = (n: unknown) =>
          n === null || n === undefined ? 'Not set' : Number(n).toLocaleString('en-IN');
        display.changes = [
          { label: 'Reorder point', before: f(lv?.reorderPoint), after: f(p.reorderPoint) },
          { label: 'Safety stock', before: f(lv?.safetyStock), after: f(p.safetyStock) },
          { label: 'Max stock', before: f(lv?.maxStock), after: f(p.maxStock) },
        ];
      } else if (r.type === 'MARKDOWN_PRICE') {
        const pr = prod.get(String(p.productId));
        display.changes = [
          { label: 'Selling price', before: pr ? inr(pr.sellingPrice) : '—', after: inr(String(p.newPrice)) },
        ];
      } else if (r.type === 'CHANGE_PREFERRED_SUPPLIER') {
        const pr = prod.get(String(p.productId));
        display.changes = [
          {
            label: 'Preferred supplier',
            before: (pr?.preferredSupplierId && preferred.get(pr.preferredSupplierId)) || 'None',
            after: sup.get(String(p.supplierId))?.name ?? '—',
          },
        ];
      }
      return display;
    });
  }

  private async toDto(rows: ActionRow[]): Promise<ActionDto[]> {
    const [displays, names] = await Promise.all([
      this.displays(
        rows.map((r) => ({
          type: r.type,
          payload: (r.editedPayload ?? r.payload) as Record<string, unknown>,
        })),
      ),
      userNames(
        this.prisma,
        rows.map((r) => r.decidedById),
      ),
    ]);
    return rows.map((r, i) => {
      const display = displays[i] as ActionDisplay;
      const key = r.agent.key as AgentKey;
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        title: r.title,
        summary: r.summary,
        rationale: r.rationale,
        rationaleSource: r.rationaleSource,
        modelUsed: r.modelUsed,
        payload: r.payload as Record<string, unknown>,
        editedPayload: (r.editedPayload as Record<string, unknown> | null) ?? null,
        expectedImpact: r.expectedImpact as ActionImpact,
        dataUsed: (r.dataUsed as Citation[] | null) ?? [],
        riskLevel: r.riskLevel,
        autoExecuted: r.autoExecuted,
        agent: { key, name: AGENT_LABELS[key] ?? key },
        runId: r.runId,
        decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : r.autoExecuted ? 'Automatic' : null,
        decidedAt: iso(r.decidedAt),
        decisionReason: r.decisionReason,
        executedAt: iso(r.executedAt),
        result: (r.result as Record<string, unknown> | null) ?? null,
        error: (r.error as { message?: string } | null)?.message ?? null,
        expiresAt: iso(r.expiresAt),
        createdAt: r.createdAt.toISOString(),
        display,
      };
    });
  }
}

function actorCanApprovePo(actor: Actor): boolean {
  const role = actorRole(actor);
  return role === 'ADMIN' || role === 'MANAGER';
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
};

/** "SKU quantities 120 → 80" style summary of an edit-and-approve, for the agent's next run. */
function describeEdits(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  const lines = (x: unknown) =>
    new Map(
      ((x as Array<{ productId: string; quantity: number }> | undefined) ?? []).map((l) => [
        l.productId,
        l.quantity,
      ]),
    );
  if (Array.isArray(b.lines) || Array.isArray(a.lines)) {
    const lb = lines(b.lines);
    const la = lines(a.lines);
    let changed = 0;
    let removed = 0;
    for (const [id, q] of lb) {
      if (!la.has(id)) removed++;
      else if (la.get(id) !== q) changed++;
    }
    if (changed) out.push(`${changed} quantity change(s)`);
    if (removed) out.push(`${removed} line(s) removed`);
    const added = [...la.keys()].filter((id) => !lb.has(id)).length;
    if (added) out.push(`${added} line(s) added`);
  }
  for (const k of Object.keys(a)) {
    if (k === 'lines') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k} ${show(b[k])} → ${show(a[k])}`);
  }
  return out.join(', ') || 'minor edits';
}
