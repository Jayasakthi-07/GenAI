import { randomBytes } from 'node:crypto';
import type { ActorView, PaginationQuery } from '@stockroom/shared';
import Decimal from 'decimal.js';
import type { Db, Tx } from '../db/client';
import { AppError } from '../domain/errors';

/* ── Money ─────────────────────────────────────────────────────────────── */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

type DecimalLike = { toString(): string } | string | number | null | undefined;

export const dec = (v: DecimalLike): Decimal => new Decimal(v === null || v === undefined ? 0 : v.toString());
/** Money for JSON: always a string with two decimals. */
export const money = (v: DecimalLike): string => dec(v).toFixed(2);
export const cost4 = (v: DecimalLike): string => dec(v).toFixed(4);

/* ── Dates ─────────────────────────────────────────────────────────────── */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const isoDay = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

/** Business date (YYYY-MM-DD) of an instant in a timezone. */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Start of a business day in a timezone, as an instant (only fixed-offset zones need to be exact here). */
export function startOfLocalDay(day: string, timeZone: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/* ── Organization settings ─────────────────────────────────────────────── */
export interface OrgSettings {
  name: string;
  currency: string;
  timezone: string;
  serviceLevel: number;
  orderCostInr: number;
  holdingRate: number;
  expiryWarningDays: number;
  overstockDays: number;
  deadStockDays: number;
  alertDedupeHours: number;
  largeAdjustmentUnits: number;
  poApprovalThresholdInr: number;
  briefingTime: string;
  replenishmentBudgetInr: number;
}

export const ORG_DEFAULTS: OrgSettings = {
  name: 'Stockroom',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  serviceLevel: 0.95,
  orderCostInr: 500,
  holdingRate: 0.2,
  expiryWarningDays: 14,
  overstockDays: 180,
  deadStockDays: 90,
  alertDedupeHours: 24,
  largeAdjustmentUnits: 50,
  poApprovalThresholdInr: 100000,
  briefingTime: '08:00',
  replenishmentBudgetInr: 1_500_000,
};

let orgCache: { at: number; value: OrgSettings } | null = null;

export async function getOrgSettings(prisma: Db | Tx): Promise<OrgSettings> {
  if (orgCache && Date.now() - orgCache.at < 30_000) return orgCache.value;
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  const settings = (org?.settings ?? {}) as Partial<OrgSettings>;
  const value: OrgSettings = {
    ...ORG_DEFAULTS,
    ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== null && v !== undefined)),
    name: org?.name ?? ORG_DEFAULTS.name,
    currency: org?.currency ?? ORG_DEFAULTS.currency,
    timezone: org?.timezone ?? ORG_DEFAULTS.timezone,
  };
  orgCache = { at: Date.now(), value };
  return value;
}

export function invalidateOrgSettings(): void {
  orgCache = null;
}

/* ── Paging and sorting ────────────────────────────────────────────────── */
export function pageArgs(q: Pick<PaginationQuery, 'page' | 'pageSize'>) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function pageMeta(q: Pick<PaginationQuery, 'page' | 'pageSize'>, total: number) {
  return { page: q.page, pageSize: q.pageSize, total };
}

/** Parses "field:dir" against a whitelist; returns the builder's result or the fallback. */
export function parseSort<T>(
  sort: string | undefined,
  allowed: Record<string, (dir: 'asc' | 'desc') => T>,
  fallback: T,
): T {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  const build = field ? allowed[field] : undefined;
  if (!build || (dir !== 'asc' && dir !== 'desc')) return fallback;
  return build(dir);
}

/* ── Cursors (keyset pagination on time-ordered rows) ──────────────────── */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const date = at ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime()) || !id) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  return { at: date, id };
}

/* ── Actors ────────────────────────────────────────────────────────────── */
export const AGENT_NAMES: Record<string, string> = {
  stock_sentinel: 'Stock Sentinel',
  demand_forecaster: 'Demand Forecaster',
  replenishment_planner: 'Replenishment Planner',
  anomaly_auditor: 'Anomaly Auditor',
  supplier_analyst: 'Supplier Analyst',
  inventory_optimizer: 'Inventory Optimizer',
  report_writer: 'Report Writer',
  assistant: 'Assistant',
};

/** Resolves user names for a set of rows in one query. */
export async function userNames(
  prisma: Db | Tx,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export function actorView(
  type: string,
  userId: string | null | undefined,
  names: Map<string, string>,
  agentKey?: string | null,
): ActorView {
  const t = (['USER', 'AGENT', 'SYSTEM', 'SIMULATOR'].includes(type) ? type : 'SYSTEM') as ActorView['type'];
  if (t === 'AGENT')
    return { type: t, name: (agentKey && AGENT_NAMES[agentKey]) || 'Agent', agentKey: agentKey ?? null };
  if (t === 'SIMULATOR') return { type: t, name: 'Simulator', agentKey: null };
  if (t === 'SYSTEM') return { type: t, name: 'System', agentKey: null };
  return { type: t, name: (userId && names.get(userId)) || 'Unknown user', agentKey: null };
}

/** Time-ordered UUIDv7 for rows inserted with raw SQL (Prisma generates its own for model creates). */
export function uuidv7(at = Date.now()): string {
  const bytes = randomBytes(16);
  let t = at;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ── Document numbers ──────────────────────────────────────────────────── */
export type SequenceKey = 'PO' | 'GRN' | 'SO' | 'TRF' | 'CC';

/** Next human-readable number (PO-2026-00412). The upsert takes a row lock, so concurrent callers never collide. */
export async function nextNumber(tx: Tx, key: SequenceKey, at: Date, timeZone: string): Promise<string> {
  const year = Number(localDay(at, timeZone).slice(0, 4));
  const rows = await tx.$queryRaw<Array<{ n: number }>>`
    INSERT INTO document_sequences (key, year, next) VALUES (${key}, ${year}, 2)
    ON CONFLICT (key, year) DO UPDATE SET next = document_sequences.next + 1
    RETURNING next - 1 AS n`;
  const n = rows[0]?.n ?? 1;
  return `${key}-${year}-${String(n).padStart(5, '0')}`;
}
