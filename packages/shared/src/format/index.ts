import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '../constants/app';

/**
 * Money arrives from the API as a decimal string (never a float). Intl.NumberFormat
 * formats numeric strings exactly, so no precision is lost on the way to the screen.
 */
type Numeric = string | number | bigint;

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    cache.set(key, formatter);
  }
  return formatter;
}

// The Intl typings only accept number | bigint, but the runtime accepts exact decimal strings (ES2023).
function fmt(formatter: Intl.NumberFormat, value: Numeric): string {
  return formatter.format(value as number);
}

export interface MoneyOptions {
  currency?: string;
  locale?: string;
  /** Drop the paise when the value is a whole number of rupees. */
  compactDecimals?: boolean;
  /** 12.3L / 1.2Cr style for KPI cards. */
  compact?: boolean;
}

export function formatMoney(value: Numeric, options: MoneyOptions = {}): string {
  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    compact = false,
    compactDecimals = false,
  } = options;
  if (compact) {
    return fmt(
      numberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }),
      value,
    );
  }
  const whole = compactDecimals && Number.isInteger(Number(value));
  return fmt(
    numberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }),
    value,
  );
}

export function formatNumber(
  value: Numeric,
  options: { locale?: string; decimals?: number; compact?: boolean } = {},
) {
  const { locale = DEFAULT_LOCALE, decimals, compact = false } = options;
  return fmt(
    numberFormat(locale, {
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: decimals ?? (compact ? 1 : 0),
      minimumFractionDigits: compact ? 0 : (decimals ?? 0),
    }),
    value,
  );
}

export function formatQuantity(value: Numeric, unit?: string, locale = DEFAULT_LOCALE): string {
  const n = formatNumber(value, { locale });
  return unit ? `${n} ${unit}` : n;
}

/** 0.1234 → "12.3%". Pass a fraction, not a percentage. */
export function formatPercent(
  fraction: Numeric,
  options: { decimals?: number; signed?: boolean; locale?: string } = {},
) {
  const { decimals = 1, signed = false, locale = DEFAULT_LOCALE } = options;
  return fmt(
    numberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }),
    fraction,
  );
}

export function formatDays(days: number, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(days)) return '—';
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${formatNumber(rounded, { locale, decimals: rounded % 1 === 0 ? 0 : 1 })} ${rounded === 1 ? 'day' : 'days'}`;
}
