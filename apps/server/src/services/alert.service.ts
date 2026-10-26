import type {
  Alert,
  AlertBulk,
  AlertType,
  AlertCounts,
  AlertStatus,
  AlertsQuery,
  Severity,
  StockCheckResult,
} from '@stockroom/shared';
import { SEVERITIES } from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import {
  analyzeBatches,
  analyzePositions,
  type BatchInput,
  type Finding,
  type PositionInput,
} from '../analytics/stock-health';
import type { Db } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { getOrgSettings, iso, isoDay, localDay, pageArgs, pageMeta, userNames } from './support';

const STOCK_TYPES = [
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'PROJECTED_STOCKOUT',
  'OVERSTOCK',
  'EXPIRING_BATCH',
] as const;
const OPEN_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'] as const;

const include = {
  product: {
    select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
  },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.AlertInclude;

type AlertRow = Prisma.AlertGetPayload<{ include: typeof include }>;

/** A condition an agent found; synced into alerts by dedupe key. */
export interface AlertFinding {
  type: AlertType;
  dedupeKey: string;
  severity: Severity;
  priority: number;
  title: string;
  message: string;
  explanation: string;
  productId?: string | null;
  warehouseId?: string | null;
  supplierId?: string | null;
  batchId?: string | null;
  data: Record<string, unknown>;
}

export class AlertService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  private async toDto(rows: AlertRow[]): Promise<Alert[]> {
    const names = await userNames(
      this.prisma,
      rows.flatMap((r) => [r.acknowledgedById, r.resolvedById]),
    );
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId).filter((id): id is string => !!id))];
    const warehouses = warehouseIds.length
      ? await this.prisma.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const wh = new Map(warehouses.map((w) => [w.id, w]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      severity: r.severity,
      status: r.status,
      priority: r.priority,
      title: r.title,
      message: r.message,
      explanation: r.explanation,
      explanationSource: r.explanationSource,
      modelUsed: r.modelUsed,
      product: r.product
        ? {
            id: r.product.id,
            sku: r.product.sku,
            name: r.product.name,
            unit: r.product.unit.code,
            trackExpiry: r.product.trackExpiry,
          }
        : null,
      warehouse: r.warehouseId ? (wh.get(r.warehouseId) ?? null) : null,
      supplier: r.supplier,
      data: (r.data ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      snoozedUntil: iso(r.snoozedUntil),
      acknowledgedAt: iso(r.acknowledgedAt),
      acknowledgedBy: r.acknowledgedById ? (names.get(r.acknowledgedById) ?? null) : null,
      resolvedAt: iso(r.resolvedAt),
      resolvedBy: r.resolvedById ? (names.get(r.resolvedById) ?? null) : null,
      resolution: r.resolution,
      autoResolved: r.autoResolved,
    }));
  }

  /** Snoozed alerts whose time is up become open again. */
  private async wakeSnoozed(): Promise<void> {
    await this.prisma.alert.updateMany({
      where: { status: 'SNOOZED', snoozedUntil: { lte: new Date() } },
      data: { status: 'OPEN', snoozedUntil: null },
    });
  }

  async list(q: AlertsQuery) {
    await this.wakeSnoozed();
    const where: Prisma.AlertWhereInput = {
      status: q.status?.length ? { in: q.status } : { in: [...OPEN_STATUSES] },
      severity: q.severity?.length ? { in: q.severity } : undefined,
      type: q.type?.length ? { in: q.type } : undefined,
      warehouseId: q.warehouseId,
      productId: q.productId,
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { message: { contains: q.q, mode: 'insensitive' } },
              { product: { sku: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [field, dir = 'desc'] = (q.sort ?? '').split(':');
    const d = dir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.AlertOrderByWithRelationInput[] =
      field === 'createdAt'
        ? [{ createdAt: d }]
        : field === 'severity'
          ? [{ priority: d }]
          : [{ priority: 'desc' }, { createdAt: 'desc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.alert.count({ where }),
      this.prisma.alert.findMany({ where, orderBy, ...pageArgs(q), include }),
    ]);
    return { data: await this.toDto(rows), meta: pageMeta(q, total) };
  }

  async get(id: string): Promise<Alert> {
    const row = await this.prisma.alert.findUnique({ where: { id }, include });
    if (!row) throw notFound('Alert');
    const [dto] = await this.toDto([row]);
    if (!dto) throw notFound('Alert');
    return dto;
  }

  async counts(): Promise<AlertCounts> {
    await this.wakeSnoozed();
    const rows = await this.prisma.alert.groupBy({
      by: ['severity', 'type'],
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      _count: { _all: true },
    });
    const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
    const byType: Record<string, number> = {};
    let open = 0;
    for (const r of rows) {
      bySeverity[r.severity] += r._count._all;
      byType[r.type] = (byType[r.type] ?? 0) + r._count._all;
      open += r._count._all;
    }
    return { open, bySeverity, byType };
  }

  private async transition(
    actor: Actor,
    ids: string[],
    status: AlertStatus,
    data: Omit<Prisma.AlertUncheckedUpdateManyInput, 'status'>,
    action: string,
    summary: string,
  ) {
    assertCan(actor, 'inventory.view');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const existing = await tx.alert.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, title: true },
      });
      if (!existing.length) throw notFound('Alert');
      await tx.alert.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: { ...data, status },
      });
      for (const e of existing) {
        await writeAudit(tx, actor, {
          action,
          entityType: 'Alert',
          entityId: e.id,
          summary: `${summary}: ${e.title}`,
          before: { status: e.status },
          after: { status },
        });
        emit('alert.updated', { alertId: e.id, status });
      }
      return existing.length;
    });
  }

  acknowledge(actor: Actor, ids: string[]) {
    const acknowledgedById = actor.type === 'user' ? actor.userId : null;
    return this.transition(
      actor,
      ids,
      'ACKNOWLEDGED',
      { acknowledgedAt: new Date(), acknowledgedById },
      'alert.acknowledge',
      'Acknowledged',
    );
  }

  snooze(actor: Actor, ids: string[], until: Date) {
    if (until.getTime() <= Date.now())
      throw new AppError('VALIDATION_ERROR', 'Snooze until a time in the future.');
    return this.transition(
      actor,
      ids,
      'SNOOZED',
      { snoozedUntil: until },
      'alert.snooze',
      `Snoozed until ${until.toISOString()}`,
    );
  }

  resolve(actor: Actor, ids: string[], resolution?: string | null) {
    const resolvedById = actor.type === 'user' ? actor.userId : null;
    return this.transition(
      actor,
      ids,
      'RESOLVED',
      { resolvedAt: new Date(), resolvedById, resolution: resolution ?? null, snoozedUntil: null },
      'alert.resolve',
      'Resolved',
    );
  }

  bulk(actor: Actor, input: AlertBulk) {
    if (input.action === 'acknowledge') return this.acknowledge(actor, input.ids);
    if (input.action === 'snooze') return this.snooze(actor, input.ids, new Date(input.until));
    return this.resolve(actor, input.ids, input.resolution);
  }

  /* ── Stock check (deterministic; the Stock Sentinel builds on it) ────── */

  /** Loads current positions and batches, runs the analyzer, and syncs rule-based stock alerts. */
  async runStockCheck(
    actor: Actor,
    runId: string | null = null,
  ): Promise<StockCheckResult & { findings: number; list: Finding[] }> {
    const started = performance.now();
    const settings = await getOrgSettings(this.prisma);
    const today = localDay(new Date(), settings.timezone);
    const findings = await this.analyze(today, settings);
    const result = await this.syncStockFindings(actor, runId, findings);
    return {
      created: result.created,
      updated: result.updated,
      resolved: result.resolved,
      findings: findings.length,
      durationMs: Math.round(performance.now() - started),
      list: findings,
    };
  }

  /** Open stock alerts by dedupe key: what the Stock Sentinel compares against. */
  stockAlertState() {
    return this.alertState([...STOCK_TYPES]);
  }

  /** Open alerts of these types by dedupe key: what an agent compares its findings against. */
  async alertState(
    types: AlertType[],
  ): Promise<Map<string, { id: string; severity: Severity; explanationSource: 'AI' | 'RULE' }>> {
    const rows = await this.prisma.alert.findMany({
      where: { type: { in: types }, status: { in: [...OPEN_STATUSES] } },
      select: { id: true, dedupeKey: true, severity: true, explanationSource: true },
    });
    return new Map(rows.map((r) => [r.dedupeKey, r]));
  }

  /** AI explanations (and bounded re-ranking) for alerts the Stock Sentinel's model reviewed. */
  async applyExplanations(
    actor: Actor,
    items: Array<{ dedupeKey: string; explanation: string; priority?: number }>,
    modelUsed: string,
  ): Promise<number> {
    if (!items.length) return 0;
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const open = await tx.alert.findMany({
        where: { dedupeKey: { in: items.map((i) => i.dedupeKey) }, status: { in: [...OPEN_STATUSES] } },
        select: { id: true, dedupeKey: true, priority: true, status: true },
      });
      const byKey = new Map(open.map((a) => [a.dedupeKey, a]));
      let n = 0;
      for (const item of items) {
        const a = byKey.get(item.dedupeKey);
        if (!a) continue;
        // The model may re-rank within ±10 of the deterministic priority, never beyond.
        const priority =
          item.priority === undefined
            ? a.priority
            : Math.max(a.priority - 10, Math.min(a.priority + 10, item.priority));
        await tx.alert.update({
          where: { id: a.id },
          data: { explanation: item.explanation.trim(), explanationSource: 'AI', modelUsed, priority },
        });
        emit('alert.updated', { alertId: a.id, status: a.status });
        n++;
      }
      if (n)
        await writeAudit(tx, actor, {
          action: 'alerts.explain',
          entityType: 'Alert',
          summary: `Explained ${n} stock alert${n === 1 ? '' : 's'}`,
          after: { keys: items.map((i) => i.dedupeKey), modelUsed },
        });
      return n;
    });
  }

  /** Creates, updates and auto-resolves stock alerts so they match the findings exactly. */
  async syncStockFindings(
    actor: Actor,
    runId: string | null,
    findings: Finding[],
  ): Promise<{ created: number; updated: number; resolved: number; createdKeys: string[] }> {
    const settings = await getOrgSettings(this.prisma);
    return this.syncFindings(actor, runId, [...STOCK_TYPES], findings, {
      quietHours: settings.alertDedupeHours,
      action: 'alerts.stock_check',
      label: 'Stock check',
    });
  }

  /**
   * Makes the open alerts of `scope` match `findings` exactly: creates new ones, updates changed facts,
   * and resolves those whose condition cleared. An alert a person resolved isn't raised again for
   * `quietHours` (the dedupe window).
   */
  async syncFindings(
    actor: Actor,
    runId: string | null,
    scope: AlertType[],
    findings: AlertFinding[],
    opts: { quietHours: number; action: string; label: string },
  ): Promise<{ created: number; updated: number; resolved: number; createdKeys: string[] }> {
    const quiet = new Set(
      (
        await this.prisma.alert.findMany({
          where: {
            type: { in: scope },
            status: 'RESOLVED',
            autoResolved: false,
            resolvedAt: { gte: new Date(Date.now() - opts.quietHours * 3_600_000) },
            dedupeKey: { in: findings.map((f) => f.dedupeKey) },
          },
          select: { dedupeKey: true },
        })
      ).map((r) => r.dedupeKey),
    );
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const open = await tx.alert.findMany({
        where: { type: { in: scope }, status: { in: [...OPEN_STATUSES] } },
        select: {
          id: true,
          dedupeKey: true,
          severity: true,
          status: true,
          priority: true,
          title: true,
          message: true,
        },
      });
      const byKey = new Map(open.map((a) => [a.dedupeKey, a]));
      const seen = new Set<string>();
      let created = 0;
      let updated = 0;
      const createdKeys: string[] = [];
      for (const f of findings) {
        seen.add(f.dedupeKey);
        const existing = byKey.get(f.dedupeKey);
        const fields = {
          severity: f.severity,
          priority: f.priority,
          title: f.title,
          message: f.message,
          data: f.data as Prisma.InputJsonValue,
        };
        if (existing) {
          // Only touch rows whose facts moved; unchanged alerts keep their updatedAt.
          const changed =
            existing.severity !== f.severity ||
            existing.priority !== f.priority ||
            existing.title !== f.title ||
            existing.message !== f.message;
          if (!changed) continue;
          await tx.alert.update({ where: { id: existing.id }, data: fields });
          if (existing.severity !== f.severity)
            emit('alert.updated', { alertId: existing.id, status: existing.status });
          updated++;
        } else if (!quiet.has(f.dedupeKey)) {
          const alert = await tx.alert.create({
            data: {
              ...fields,
              type: f.type,
              explanation: f.explanation,
              explanationSource: 'RULE',
              productId: f.productId ?? null,
              warehouseId: f.warehouseId ?? null,
              supplierId: f.supplierId ?? null,
              batchId: f.batchId ?? null,
              dedupeKey: f.dedupeKey,
              agentRunId: runId,
            },
            select: { id: true },
          });
          emit('alert.created', { alertId: alert.id, type: f.type, severity: f.severity });
          created++;
          createdKeys.push(f.dedupeKey);
        }
      }
      const cleared = open.filter((a) => !seen.has(a.dedupeKey));
      if (cleared.length) {
        await tx.alert.updateMany({
          where: { id: { in: cleared.map((c) => c.id) } },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            autoResolved: true,
            resolution: 'Condition cleared',
            snoozedUntil: null,
          },
        });
        for (const c of cleared) emit('alert.updated', { alertId: c.id, status: 'RESOLVED' });
      }
      if (created || cleared.length) {
        await writeAudit(tx, actor, {
          action: opts.action,
          entityType: 'Alert',
          summary: `${opts.label}: ${created} new, ${updated} updated, ${cleared.length} resolved`,
          after: { created, updated, resolved: cleared.length, findings: findings.length },
        });
      }
      return { created, updated, resolved: cleared.length, createdKeys };
    });
  }

  /** Deterministic findings for today (no writes). */
  async analyze(today: string, settings: Awaited<ReturnType<typeof getOrgSettings>>): Promise<Finding[]> {
    const positions = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        sku: string;
        name: string;
        unit: string;
        warehouse_id: string;
        wh_code: string;
        on_hand: number;
        available: number;
        on_order: number;
        reorder_point: number | null;
        max_stock: number | null;
        avg_daily_demand: number;
        lead_time_days: number | null;
        avg_cost: string;
        cost_price: string;
        next_po: string | null;
        next_expected: Date | null;
      }>
    >`
      SELECT v.product_id, p.sku, p.name, u.code AS unit, v.warehouse_id, w.code AS wh_code,
             v.on_hand, v.available, v.on_order, v.reorder_point, v.max_stock, v.avg_daily_demand,
             p.lead_time_days, v.avg_cost::text, p.cost_price::text,
             np.number AS next_po, np.expected_date AS next_expected
      FROM v_stock_positions v
      JOIN products p ON p.id = v.product_id AND p.status = 'ACTIVE'
      JOIN units u ON u.id = p.unit_id
      JOIN warehouses w ON w.id = v.warehouse_id AND w.is_active
      LEFT JOIN LATERAL (
        SELECT po.number, po.expected_date FROM purchase_orders po
        JOIN purchase_order_lines l ON l.purchase_order_id = po.id AND l.product_id = v.product_id
        WHERE po.warehouse_id = v.warehouse_id AND po.status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED')
          AND l.quantity_ordered > l.quantity_received + l.quantity_rejected
        ORDER BY po.expected_date ASC NULLS LAST LIMIT 1
      ) np ON true`;

    const positionInputs: PositionInput[] = positions.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      productName: r.name,
      unit: r.unit,
      warehouseId: r.warehouse_id,
      warehouseCode: r.wh_code,
      onHand: r.on_hand,
      available: r.available,
      onOrder: r.on_order,
      reorderPoint: r.reorder_point,
      maxStock: r.max_stock,
      avgDailyDemand: r.avg_daily_demand,
      leadTimeDays: r.lead_time_days ?? 7,
      unitCost: Number(r.avg_cost) > 0 ? Number(r.avg_cost) : Number(r.cost_price),
      nextDelivery: r.next_po ? { number: r.next_po, expectedDate: isoDay(r.next_expected) } : null,
    }));

    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + settings.expiryWarningDays);
    const demand = new Map(positions.map((r) => [`${r.product_id}|${r.warehouse_id}`, r.avg_daily_demand]));
    const batches = await this.prisma.batch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lte: horizon }, product: { status: 'ACTIVE' } },
      include: {
        product: { select: { sku: true, name: true, unit: { select: { code: true } } } },
        warehouse: { select: { code: true } },
      },
    });
    const batchInputs: BatchInput[] = batches
      .filter((b) => b.expiryDate)
      .map((b) => ({
        batchId: b.id,
        batchNo: b.batchNo,
        productId: b.productId,
        sku: b.product.sku,
        productName: b.product.name,
        unit: b.product.unit.code,
        warehouseId: b.warehouseId,
        warehouseCode: b.warehouse.code,
        quantity: b.quantity,
        expiryDate: isoDay(b.expiryDate) ?? today,
        unitCost: Number(b.unitCost),
        avgDailyDemand: demand.get(`${b.productId}|${b.warehouseId}`) ?? 0,
      }));

    const opts = {
      today,
      expiryWarningDays: settings.expiryWarningDays,
      overstockDays: settings.overstockDays,
      overstockMinValue: 5000,
    };
    return [...analyzePositions(positionInputs, opts), ...analyzeBatches(batchInputs, opts)].sort(
      (a, b) => b.priority - a.priority,
    );
  }
}
