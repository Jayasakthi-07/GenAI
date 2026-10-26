import type { AgentKey } from '@stockroom/shared';
import type { AnyAgentModule } from '../types';
import { replenishmentPlanner } from './replenishment-planner';
import { stockSentinel } from './stock-sentinel';

/** Every agent, in the order the hub shows them. */
export const AGENT_MODULES: AnyAgentModule[] = [stockSentinel, replenishmentPlanner];

export const agentModuleMap = (): Map<AgentKey, AnyAgentModule> =>
  new Map(AGENT_MODULES.map((m) => [m.key, m]));
