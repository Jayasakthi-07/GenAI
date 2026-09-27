export const ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Full access, including users, organization settings and AI provider keys.',
  MANAGER: 'Runs operations: approves purchase orders and agent proposals, manages agents.',
  STAFF: 'Day-to-day stock work: receiving, issuing, counting and sales orders.',
};

/**
 * Every permission the API checks. The server enforces them in services;
 * the UI uses the same map to hide or disable controls.
 */
export const PERMISSIONS = [
  'inventory.view',
  'stock.operate',
  'stock.adjust.large',
  'stock.write_off',
  'counts.approve',
  'catalog.manage',
  'suppliers.manage',
  'customers.manage',
  'purchase_orders.create',
  'purchase_orders.approve',
  'sales_orders.create',
  'actions.approve',
  'agents.run',
  'agents.configure',
  'ai.configure',
  'users.manage',
  'organization.manage',
  'simulation.control',
  'demo.reset',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_PERMISSIONS: Permission[] = [
  'inventory.view',
  'stock.operate',
  'stock.adjust.large',
  'stock.write_off',
  'counts.approve',
  'catalog.manage',
  'suppliers.manage',
  'customers.manage',
  'purchase_orders.create',
  'purchase_orders.approve',
  'sales_orders.create',
  'actions.approve',
  'agents.run',
  'agents.configure',
  'simulation.control',
  'audit.view',
];

const STAFF_PERMISSIONS: Permission[] = [
  'inventory.view',
  'stock.operate',
  'purchase_orders.create',
  'sales_orders.create',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  MANAGER: new Set(MANAGER_PERMISSIONS),
  STAFF: new Set(STAFF_PERMISSIONS),
};

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
