/** Enumerations and display labels shared by the API and the UI. Keep in sync with prisma/schema.prisma. */

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const MOVEMENT_TYPES = [
  'OPENING_BALANCE',
  'RECEIPT',
  'SALE',
  'RETURN',
  'ISSUE',
  'ADJUSTMENT',
  'WRITE_OFF',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'COUNT_CORRECTION',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING_BALANCE: 'Opening balance',
  RECEIPT: 'Receipt',
  SALE: 'Sale',
  RETURN: 'Customer return',
  ISSUE: 'Issue',
  ADJUSTMENT: 'Adjustment',
  WRITE_OFF: 'Write-off',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  COUNT_CORRECTION: 'Count correction',
};

/**
 * Stock position of a product at a warehouse:
 * OUT — nothing available · LOW — at/below reorder point with nothing (enough) on order ·
 * ON_ORDER — at/below reorder point but covered by open POs · OVER — more than twice the max stock.
 */
export const STOCK_STATES = ['OUT', 'LOW', 'ON_ORDER', 'OK', 'OVER'] as const;
export type StockState = (typeof STOCK_STATES)[number];
export const STOCK_STATE_LABELS: Record<StockState, string> = {
  OUT: 'Out of stock',
  LOW: 'Low',
  ON_ORDER: 'Reordered',
  OK: 'In stock',
  OVER: 'Overstock',
};
export const STOCK_STATE_TONES: Record<StockState, Tone> = {
  OUT: 'danger',
  LOW: 'warning',
  ON_ORDER: 'accent',
  OK: 'success',
  OVER: 'neutral',
};

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DISCONTINUED: 'Discontinued',
};
export const PRODUCT_STATUS_TONES: Record<ProductStatus, Tone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  DISCONTINUED: 'danger',
};

export const PO_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  SENT: 'Sent',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};
export const PO_STATUS_TONES: Record<PurchaseOrderStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'accent',
  SENT: 'accent',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'danger',
};
/** Statuses whose remaining quantity counts as "on order". */
export const PO_OPEN_STATUSES: PurchaseOrderStatus[] = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'];

export const SO_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'] as const;
export type SalesOrderStatus = (typeof SO_STATUSES)[number];
export const SO_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  PARTIALLY_FULFILLED: 'Partially fulfilled',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};
export const SO_STATUS_TONES: Record<SalesOrderStatus, Tone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'accent',
  PARTIALLY_FULFILLED: 'warning',
  FULFILLED: 'success',
  CANCELLED: 'danger',
};

export const SALES_CHANNELS = ['STORE', 'WHOLESALE', 'ONLINE'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  STORE: 'Store',
  WHOLESALE: 'Wholesale',
  ONLINE: 'Online',
};

export const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'ONLINE'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  ONLINE: 'Online marketplace',
};

export const TRANSFER_STATUSES = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: 'Draft',
  IN_TRANSIT: 'In transit',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};
export const TRANSFER_STATUS_TONES: Record<TransferStatus, Tone> = {
  DRAFT: 'neutral',
  IN_TRANSIT: 'accent',
  RECEIVED: 'success',
  CANCELLED: 'danger',
};

export const CYCLE_COUNT_STATUSES = ['OPEN', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];
export const CYCLE_COUNT_STATUS_LABELS: Record<CycleCountStatus, string> = {
  OPEN: 'Counting',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
export const CYCLE_COUNT_STATUS_TONES: Record<CycleCountStatus, Tone> = {
  OPEN: 'accent',
  IN_REVIEW: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};
export const COUNT_LINE_STATUSES = ['PENDING', 'COUNTED', 'ACCEPTED', 'RECOUNT'] as const;
export type CountLineStatus = (typeof COUNT_LINE_STATUSES)[number];

export const ALERT_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'OVERSTOCK',
  'PROJECTED_STOCKOUT',
  'EXPIRING_BATCH',
  'DEMAND_SPIKE',
  'ANOMALY',
  'SUPPLIER_RISK',
  'FORECAST_SHIFT',
  'DEAD_STOCK',
  'SYSTEM',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  OVERSTOCK: 'Overstock',
  PROJECTED_STOCKOUT: 'Projected stockout',
  EXPIRING_BATCH: 'Expiring batch',
  DEMAND_SPIKE: 'Demand spike',
  ANOMALY: 'Anomaly',
  SUPPLIER_RISK: 'Supplier risk',
  FORECAST_SHIFT: 'Forecast shift',
  DEAD_STOCK: 'Dead stock',
  SYSTEM: 'System',
};

export const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = {
  INFO: 'Info',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};
export const SEVERITY_TONES: Record<Severity, Tone> = {
  INFO: 'neutral',
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  SNOOZED: 'Snoozed',
  RESOLVED: 'Resolved',
};

export const ACTOR_TYPES = ['USER', 'AGENT', 'SYSTEM', 'SIMULATOR'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const REASON_DIRECTIONS = ['IN', 'OUT', 'BOTH'] as const;
export type ReasonDirection = (typeof REASON_DIRECTIONS)[number];

export const ABC_CLASSES = ['A', 'B', 'C'] as const;
export const XYZ_CLASSES = ['X', 'Y', 'Z'] as const;
