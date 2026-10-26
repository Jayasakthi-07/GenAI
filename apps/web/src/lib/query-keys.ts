/** Every TanStack Query key in one place, so realtime events can invalidate precisely. */
export const queryKeys = {
  me: ['me'] as const,
  systemInfo: ['system', 'info'] as const,
  dashboard: {
    all: ['dashboard'] as const,
    overview: (days: number) => ['dashboard', 'overview', days] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    units: ['catalog', 'units'] as const,
    categories: ['catalog', 'categories'] as const,
    warehouses: ['catalog', 'warehouses'] as const,
    reasonCodes: ['catalog', 'reason-codes'] as const,
    savedViews: (page: string) => ['catalog', 'saved-views', page] as const,
  },
  products: {
    all: ['products'] as const,
    list: (q: object) => ['products', 'list', q] as const,
    picker: (q: string, warehouseId?: string) => ['products', 'picker', q, warehouseId] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    movements: (id: string, q: object) => ['products', 'detail', id, 'movements', q] as const,
    sales: (id: string, days: number) => ['products', 'detail', id, 'sales', days] as const,
    suppliers: (id: string) => ['products', 'detail', id, 'suppliers'] as const,
    activity: (id: string) => ['products', 'detail', id, 'activity'] as const,
  },
  stock: {
    all: ['stock'] as const,
    positions: (q: object) => ['stock', 'positions', q] as const,
    summary: (warehouseId?: string) => ['stock', 'summary', warehouseId] as const,
    movements: (q: object) => ['stock', 'movements', q] as const,
    batches: (q: object) => ['stock', 'batches', q] as const,
    fefo: (productId: string, warehouseId: string, quantity: number) =>
      ['stock', 'fefo', productId, warehouseId, quantity] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    list: (q: object) => ['transfers', 'list', q] as const,
    detail: (id: string) => ['transfers', 'detail', id] as const,
  },
  cycleCounts: {
    all: ['cycle-counts'] as const,
    list: (q: object) => ['cycle-counts', 'list', q] as const,
    detail: (id: string) => ['cycle-counts', 'detail', id] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    list: (q: object) => ['suppliers', 'list', q] as const,
    detail: (id: string) => ['suppliers', 'detail', id] as const,
    catalog: (id: string) => ['suppliers', 'detail', id, 'catalog'] as const,
    scorecard: (id: string) => ['suppliers', 'detail', id, 'scorecard'] as const,
  },
  purchaseOrders: {
    all: ['purchase-orders'] as const,
    list: (q: object) => ['purchase-orders', 'list', q] as const,
    detail: (id: string) => ['purchase-orders', 'detail', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (q: object) => ['customers', 'list', q] as const,
  },
  salesOrders: {
    all: ['sales-orders'] as const,
    list: (q: object) => ['sales-orders', 'list', q] as const,
    detail: (id: string) => ['sales-orders', 'detail', id] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (q: object) => ['alerts', 'list', q] as const,
    counts: ['alerts', 'counts'] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (q: object) => ['audit', 'list', q] as const,
    facets: ['audit', 'facets'] as const,
  },
  agents: {
    all: ['agents'] as const,
    list: ['agents', 'list'] as const,
    detail: (key: string) => ['agents', 'detail', key] as const,
    graph: ['agents', 'graph'] as const,
  },
  runs: {
    all: ['agent-runs'] as const,
    list: (q: object) => ['agent-runs', 'list', q] as const,
    active: ['agent-runs', 'active'] as const,
    detail: (id: string) => ['agent-runs', 'detail', id] as const,
  },
  actions: {
    all: ['actions'] as const,
    list: (q: object) => ['actions', 'list', q] as const,
    counts: ['actions', 'counts'] as const,
    detail: (id: string) => ['actions', 'detail', id] as const,
  },
};

/**
 * Stock touches almost every screen (positions, product pages, orders' availability, alerts, the
 * dashboard). After any stock-changing mutation these roots are refreshed together.
 */
export const INVENTORY_ROOTS = [
  queryKeys.stock.all,
  queryKeys.products.all,
  queryKeys.dashboard.all,
  queryKeys.alerts.all,
  queryKeys.purchaseOrders.all,
  queryKeys.salesOrders.all,
  queryKeys.transfers.all,
  queryKeys.cycleCounts.all,
  queryKeys.suppliers.all,
  queryKeys.audit.all,
  queryKeys.catalog.warehouses,
] as const;
