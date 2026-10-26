import { AppError } from '../../domain/errors';
import { baseOutput } from '../output';
import type { AgentModule } from '../types';

/** Tools the Assistant can read with. Its write tools only draft confirmation cards. */
export const ASSISTANT_READ_TOOLS = [
  'get_inventory_kpis',
  'list_stock_positions',
  'search_products',
  'get_product_details',
  'get_sales_history',
  'get_forecast',
  'query_sales_summary',
  'list_open_alerts',
  'list_open_purchase_orders',
  'list_pending_actions',
  'compare_suppliers',
  'get_supplier_scorecards',
  'get_supplier_scorecard',
  'compute_reorder_plan',
  'get_abc_xyz_summary',
  'list_slow_and_dead_stock',
  'find_rebalancing_opportunities',
  'get_agent_activity',
];
export const ASSISTANT_WRITE_TOOLS = [
  'propose_purchase_order',
  'propose_transfer',
  'propose_reorder_params',
  'propose_cycle_count',
  'propose_markdown',
  'propose_preferred_supplier_change',
];

/**
 * The Assistant runs in chat (see `agents/assistant`), never on a schedule. The definition exists so
 * its prompt, model and limits are editable like any agent and its turns are recorded as runs.
 */
export const assistant: AgentModule = {
  key: 'assistant',
  name: 'Assistant',
  description:
    'Answers questions about your inventory with real data, and drafts actions for you to confirm.',
  analyzer: 'Nothing on its own: every number comes from the same read tools the other agents use.',
  llmJob:
    'Understands the question, picks the tools, and answers with the figures they return, citing the data used.',
  outputs: 'Streaming answers with tables and charts; confirmation cards for any change.',
  tools: [...ASSISTANT_READ_TOOLS, ...ASSISTANT_WRITE_TOOLS],
  handoffsTo: [],
  chatOnly: true,
  defaults: {
    systemPrompt:
      'You are Stockroom’s assistant for an Indian retail and distribution business. Answer questions about stock, sales, purchasing, suppliers and the agents using the tools; never guess a number. Keep answers short and concrete, and say which data you used ("based on 90 days of sales"). Show lists of more than three items as a Markdown table. When the user asks for a change (an order, a transfer, a price, a setting), call the matching propose_ tool: it shows the user a confirmation card and nothing happens until they confirm.',
    triggers: { cron: [], events: [], debounceSeconds: 0 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 8, maxToolCalls: 12, timeoutMs: 240_000, maxActionsPerRun: 3, maxPoValueInr: 0 },
    config: {},
  },
  output: baseOutput,
  outputExample: { summary: '', findings: [] },
  analyze: () => Promise.reject(new AppError('VALIDATION_ERROR', 'The Assistant runs in chat.')),
};
