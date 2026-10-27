import { z } from 'zod';

export const SIMULATION_SCENARIOS = ['festive_rush', 'supplier_delay', 'shrinkage', 'demand_drop'] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export const SIMULATION_SCENARIO_INFO: Record<
  SimulationScenario,
  { label: string; description: string; reaction: string }
> = {
  festive_rush: {
    label: 'Festive rush',
    description:
      'Demand jumps for two simulated days: four times normal for festive categories, nearly double elsewhere.',
    reaction:
      'Stock falls fast → the Stock Sentinel raises alerts → the Replenishment Planner drafts purchase orders.',
  },
  supplier_delay: {
    label: 'Supplier delay',
    description:
      'A major supplier misses its delivery dates: its open orders become overdue and nothing arrives for three simulated days.',
    reaction:
      'Overdue orders → the Supplier Analyst lowers its score → the Planner looks for another supplier.',
  },
  shrinkage: {
    label: 'Shrinkage incident',
    description: 'Unexplained losses of high-value stock at one warehouse, recorded as adjustments.',
    reaction: 'The Anomaly Auditor flags the losses and proposes a cycle count.',
  },
  demand_drop: {
    label: 'Demand drop',
    description: 'Sales of one category fall to a third of normal for three simulated days.',
    reaction: 'Cover rises → the Inventory Optimizer spots slow stock; forecasts adjust on their next run.',
  },
};

/** Simulated hours per 5-second tick. */
export const SIMULATION_SPEEDS = [1, 2, 4, 8] as const;
export const SIMULATION_TICK_SECONDS = 5;

export const simulationStateSchema = z.object({
  /** False unless DEMO_MODE is on; the simulator then refuses to start. */
  available: z.boolean(),
  running: z.boolean(),
  speed: z.number().int(),
  startedAt: z.string().nullable(),
  /** Simulated hours since the simulator was started. */
  simulatedHours: z.number(),
  scenario: z
    .object({
      key: z.enum(SIMULATION_SCENARIOS),
      label: z.string(),
      detail: z.string(),
      /** Simulated hours left; 0 for one-off scenarios. */
      hoursLeft: z.number(),
    })
    .nullable(),
  stats: z.object({
    orders: z.number().int(),
    units: z.number().int(),
    revenue: z.string(),
    sentOrders: z.number().int(),
    receipts: z.number().int(),
    adjustments: z.number().int(),
  }),
  /** The last day with recorded sales before today, to show how current the demo data is. */
  lastSalesDay: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type SimulationState = z.infer<typeof simulationStateSchema>;

export const simulationSpeedSchema = z.object({
  speed: z.union(
    SIMULATION_SPEEDS.map((s) => z.literal(s)) as [
      z.ZodLiteral<1>,
      z.ZodLiteral<2>,
      ...z.ZodLiteral<number>[],
    ],
  ),
});

export const demoResetResultSchema = z.object({ seconds: z.number(), today: z.string() });
export type DemoResetResult = z.infer<typeof demoResetResultSchema>;
