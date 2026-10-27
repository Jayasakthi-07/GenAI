import type { SimulationScenario } from '@stockroom/shared';

/** Categories whose sales jump most around festivals (sweets, oil and ghee, spices, cleaning). */
export const FESTIVE_CATEGORIES = ['Snacks & Sweets', 'Edible Oils & Ghee', 'Spices & Masalas', 'Home Care'];
/** The category whose sales fall in the demand-drop scenario (falls back to the largest one). */
export const DROP_CATEGORY = 'Beverages';

/** How long each ongoing scenario lasts, in simulated hours (one-off scenarios: 0). */
export const SCENARIO_HOURS: Record<SimulationScenario, number> = {
  festive_rush: 48,
  supplier_delay: 72,
  shrinkage: 0,
  demand_drop: 72,
};

export interface ActiveScenario {
  key: SimulationScenario;
  hoursLeft: number;
  detail: string;
  /** supplier_delay: whose deliveries are held. */
  supplierId?: string;
  /** demand_drop: which root category falls. */
  category?: string;
}

/** Demand multiplier for a product in a root category while a scenario runs. */
export function demandMultiplier(scenario: ActiveScenario | null, category: string): number {
  if (!scenario || scenario.hoursLeft <= 0) return 1;
  if (scenario.key === 'festive_rush') return FESTIVE_CATEGORIES.includes(category) ? 4 : 1.8;
  if (scenario.key === 'demand_drop') return category === scenario.category ? 1 / 3 : 1;
  return 1;
}

/**
 * Units sold at one location in one tick: a Poisson draw around the daily rate scaled to the
 * tick's simulated hours, never more than is available.
 */
export function tickDemand(
  ratePerDay: number,
  hours: number,
  multiplier: number,
  available: number,
  poisson: (lambda: number) => number,
): number {
  if (ratePerDay <= 0 || available <= 0) return 0;
  return Math.min(available, poisson((ratePerDay * hours * multiplier) / 24));
}

/** Real seconds until a purchase order sent now should arrive, given the simulator's speed. */
export function arrivalSeconds(leadDays: number, speedHoursPerTick: number, tickSeconds: number): number {
  return Math.max(1, leadDays) * (24 / speedHoursPerTick) * tickSeconds;
}
