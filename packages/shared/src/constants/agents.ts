import type { Tone } from './inventory';

export const AGENT_KEYS = [
  'stock_sentinel',
  'demand_forecaster',
  'replenishment_planner',
  'anomaly_auditor',
  'supplier_analyst',
  'inventory_optimizer',
  'report_writer',
  'assistant',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const AGENT_LABELS: Record<AgentKey, string> = {
  stock_sentinel: 'Stock Sentinel',
  demand_forecaster: 'Demand Forecaster',
  replenishment_planner: 'Replenishment Planner',
  anomaly_auditor: 'Anomaly Auditor',
  supplier_analyst: 'Supplier Analyst',
  inventory_optimizer: 'Inventory Optimizer',
  report_writer: 'Report Writer',
  assistant: 'Assistant',
};

export const AUTONOMIES = ['OBSERVE', 'RECOMMEND', 'ACT'] as const;
export type Autonomy = (typeof AUTONOMIES)[number];
export const AUTONOMY_LABELS: Record<Autonomy, string> = {
  OBSERVE: 'Observe',
  RECOMMEND: 'Recommend',
  ACT: 'Act',
};
export const AUTONOMY_DESCRIPTIONS: Record<Autonomy, string> = {
  OBSERVE: 'Reports findings only. Proposals are listed in the run, never queued for approval.',
  RECOMMEND: 'Every proposal waits in Approvals for a person to approve, edit or reject.',
  ACT: 'Low-risk proposals within the limits run automatically; the rest wait for approval.',
};

export const RUN_TRIGGERS = ['SCHEDULE', 'EVENT', 'MANUAL', 'CHAT', 'HANDOFF'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];
export const RUN_TRIGGER_LABELS: Record<RunTrigger, string> = {
  SCHEDULE: 'Scheduled',
  EVENT: 'Event',
  MANUAL: 'Manual',
  CHAT: 'Chat',
  HANDOFF: 'Hand-off',
};

export const RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'NO_CHANGE', 'FAILED', 'CANCELLED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  NO_CHANGE: 'No change',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};
export const RUN_STATUS_TONES: Record<RunStatus, Tone> = {
  QUEUED: 'neutral',
  RUNNING: 'accent',
  SUCCEEDED: 'success',
  NO_CHANGE: 'neutral',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export const RUN_MODES = ['AI', 'RULE_BASED'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const STEP_TYPES = [
  'CONTEXT',
  'ANALYSIS',
  'LLM_CALL',
  'TOOL_CALL',
  'THINKING',
  'VALIDATION_ERROR',
  'HANDOFF',
  'FINAL',
  'ERROR',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const ACTION_TYPES = [
  'CREATE_PURCHASE_ORDER',
  'CREATE_TRANSFER',
  'UPDATE_REORDER_PARAMS',
  'CREATE_CYCLE_COUNT',
  'MARKDOWN_PRICE',
  'CHANGE_PREFERRED_SUPPLIER',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  CREATE_PURCHASE_ORDER: 'Purchase order',
  CREATE_TRANSFER: 'Transfer',
  UPDATE_REORDER_PARAMS: 'Reorder settings',
  CREATE_CYCLE_COUNT: 'Cycle count',
  MARKDOWN_PRICE: 'Markdown',
  CHANGE_PREFERRED_SUPPLIER: 'Preferred supplier',
};

export const ACTION_STATUSES = ['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved',
  EXECUTED: 'Done',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};
export const ACTION_STATUS_TONES: Record<ActionStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'accent',
  EXECUTED: 'success',
  REJECTED: 'neutral',
  FAILED: 'danger',
  EXPIRED: 'neutral',
};

/** Domain events an agent can be triggered by (a subset of the server's event bus). */
export const AGENT_EVENTS = [
  'stock.changed',
  'stock.adjusted',
  'count.completed',
  'po.received',
  'po.status_changed',
  'sale.recorded',
] as const;
export type AgentEvent = (typeof AGENT_EVENTS)[number];
export const AGENT_EVENT_LABELS: Record<AgentEvent, string> = {
  'stock.changed': 'Stock changes',
  'stock.adjusted': 'Stock adjustments',
  'count.completed': 'Cycle count completed',
  'po.received': 'Goods received',
  'po.status_changed': 'Purchase order status changes',
  'sale.recorded': 'Sales recorded',
};
