import type { AgentKey } from '@stockroom/shared';
import type { AnyAgentModule } from '../types';
import { anomalyAuditor } from './anomaly-auditor';
import { assistant } from './assistant';
import { demandForecaster } from './demand-forecaster';
import { inventoryOptimizer } from './inventory-optimizer';
import { replenishmentPlanner } from './replenishment-planner';
import { reportWriter } from './report-writer';
import { stockSentinel } from './stock-sentinel';
import { supplierAnalyst } from './supplier-analyst';

/** Every agent, in the order the hub shows them. */
export const AGENT_MODULES: AnyAgentModule[] = [
  stockSentinel,
  demandForecaster,
  replenishmentPlanner,
  anomalyAuditor,
  supplierAnalyst,
  inventoryOptimizer,
  reportWriter,
  assistant,
];

export const agentModuleMap = (): Map<AgentKey, AnyAgentModule> =>
  new Map(AGENT_MODULES.map((m) => [m.key, m]));
