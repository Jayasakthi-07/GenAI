import { formatMoney, formatNumber } from '@stockroom/shared';
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/** Display helpers for the web app. Money and numbers come from @stockroom/shared so the server and PDFs agree. */

export const money = (value: string | number) => formatMoney(value);
export const moneyWhole = (value: string | number) => formatMoney(value, { compactDecimals: true });
export const moneyCompact = (value: string | number) => formatMoney(value, { compact: true });
export const qty = (value: number) => formatNumber(value);

function parse(value: string): Date | null {
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** 27 Sept 2026 — also for date-only (YYYY-MM-DD) business days. */
export function date(value: string | null | undefined): string {
  const d = value ? parse(value) : null;
  return d ? format(d, 'd MMM yyyy') : '—';
}

/** 27 Sept, 4:05 pm */
export function dateTime(value: string | null | undefined): string {
  const d = value ? parse(value) : null;
  if (!d) return '—';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM, h:mm a' : 'd MMM yyyy, h:mm a');
}

/** "3 minutes ago" */
export function ago(value: string | null | undefined): string {
  const d = value ? parse(value) : null;
  return d ? `${formatDistanceToNowStrict(d)} ago` : '—';
}

/** Days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(value: string | null | undefined): number | null {
  const d = value ? parse(value) : null;
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function addDays(days: number): string {
  return format(new Date(Date.now() + days * 86_400_000), 'yyyy-MM-dd');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
