/**
 * Calendar helpers for the demo dataset. The demo organization is in India (IST, UTC+05:30, no DST),
 * so business days are computed with a fixed offset.
 */
const IST_OFFSET_MIN = 330;

/** 'YYYY-MM-DD' business day in IST for an instant. */
export function istDay(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Instant for a wall-clock time on an IST business day. */
export function istInstant(day: string, minutesOfDay: number): Date {
  // Arithmetic (not string building) so fractional minutes never produce an invalid ":60" second.
  return new Date(Date.parse(`${day}T00:00:00+05:30`) + Math.round(minutesOfDay * 60_000));
}

/** Date value for a @db.Date column (UTC midnight of the business day). */
export function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function monthOf(day: string): number {
  return Number(day.slice(5, 7));
}

export type FestiveGroup =
  | 'sweets_snacks'
  | 'dry_fruits'
  | 'gifting'
  | 'ghee'
  | 'oils'
  | 'puja'
  | 'cleaning'
  | 'rice_jaggery'
  | 'coconut'
  | 'vermicelli'
  | 'bakery'
  | 'general';

export interface Festival {
  name: string;
  day: string;
  /** Demand starts rising this many days before. */
  leadDays: number;
  /** Extra demand at the peak, as a fraction (1.0 = double). */
  lift: Partial<Record<FestiveGroup, number>>;
}

/** Festivals that move retail demand in Tamil Nadu across the demo window (approximate dates). */
const RAMZAN = { vermicelli: 2.2, dry_fruits: 1.0, gifting: 1.5, sweets_snacks: 0.3, general: 0.1 };
const TAMIL_NEW_YEAR = { puja: 0.6, sweets_snacks: 0.4, rice_jaggery: 0.3, general: 0.08 };
const AADI_PERUKKU = { puja: 0.5, rice_jaggery: 0.4, general: 0.05 };
const VINAYAGAR = { puja: 1.2, rice_jaggery: 0.6, ghee: 0.5, coconut: 0.6, sweets_snacks: 0.3, general: 0.1 };
const AYUDHA_POOJA = { puja: 1.4, ghee: 0.5, sweets_snacks: 0.4, general: 0.12 };
const DEEPAVALI = {
  gifting: 18,
  dry_fruits: 3.5,
  sweets_snacks: 1.3,
  ghee: 1.1,
  oils: 0.6,
  puja: 3.0,
  cleaning: 0.7,
  general: 0.25,
};
const KARTHIGAI_DEEPAM = { puja: 1.5, ghee: 0.5, oils: 0.3, general: 0.05 };

export const FESTIVALS: Festival[] = [
  { name: 'Ramzan', day: '2025-03-31', leadDays: 6, lift: RAMZAN },
  { name: 'Tamil New Year', day: '2025-04-14', leadDays: 5, lift: TAMIL_NEW_YEAR },
  { name: 'Aadi Perukku', day: '2025-08-03', leadDays: 4, lift: AADI_PERUKKU },
  { name: 'Vinayagar Chathurthi', day: '2025-08-27', leadDays: 6, lift: VINAYAGAR },
  { name: 'Ayudha Pooja', day: '2025-10-01', leadDays: 10, lift: AYUDHA_POOJA },
  { name: 'Deepavali', day: '2025-10-20', leadDays: 18, lift: DEEPAVALI },
  { name: 'Karthigai Deepam', day: '2025-12-04', leadDays: 5, lift: KARTHIGAI_DEEPAM },
  {
    name: 'Christmas',
    day: '2025-12-25',
    leadDays: 6,
    lift: { bakery: 0.5, dry_fruits: 0.4, general: 0.08 },
  },
  {
    name: 'Pongal',
    day: '2026-01-14',
    leadDays: 7,
    lift: { rice_jaggery: 1.2, ghee: 0.7, puja: 0.4, sweets_snacks: 0.3, coconut: 0.3, general: 0.12 },
  },
  { name: 'Ramzan', day: '2026-03-20', leadDays: 6, lift: RAMZAN },
  { name: 'Tamil New Year', day: '2026-04-14', leadDays: 5, lift: TAMIL_NEW_YEAR },
  { name: 'Aadi Perukku', day: '2026-08-03', leadDays: 4, lift: AADI_PERUKKU },
  { name: 'Vinayagar Chathurthi', day: '2026-09-14', leadDays: 6, lift: VINAYAGAR },
  { name: 'Ayudha Pooja', day: '2026-10-19', leadDays: 10, lift: AYUDHA_POOJA },
  { name: 'Deepavali', day: '2026-11-08', leadDays: 18, lift: DEEPAVALI },
  { name: 'Karthigai Deepam', day: '2026-11-23', leadDays: 5, lift: KARTHIGAI_DEEPAM },
];

/** Festive demand multiplier for a day and a product's festive groups. */
export function festiveMultiplier(day: string, groups: readonly FestiveGroup[]): number {
  let extra = 0;
  for (const festival of FESTIVALS) {
    const offset = daysBetween(day, festival.day); // > 0 before the festival
    if (offset < -2 || offset > festival.leadDays) continue;
    // Ramp up to a peak two days before, then fall off sharply after the day.
    const shape =
      offset >= 2 ? 1 - (offset - 2) / (festival.leadDays - 1) : offset >= 0 ? 1 : 0.35 + 0.3 * (offset + 2);
    const weight = Math.max(0, shape);
    extra += (festival.lift.general ?? 0) * weight;
    for (const group of groups) extra += (festival.lift[group] ?? 0) * weight;
  }
  return 1 + extra;
}
