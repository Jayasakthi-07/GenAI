import type { Permission } from '@stockroom/shared';
import {
  ArrowLeftRight,
  Bell,
  Bot,
  Boxes,
  ClipboardCheck,
  Factory,
  History,
  Inbox,
  MessagesSquare,
  Info,
  LayoutDashboard,
  Package,
  Palette,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Extra words for the command palette. */
  keywords?: string[];
  /** Live count shown next to the label. */
  badge?: 'alerts' | 'approvals';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Only pages that exist are listed; the remaining Insights pages are added
 * here as their phases ship.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, keywords: ['home', 'kpi', 'overview'] },
      {
        label: 'Alerts',
        to: '/alerts',
        icon: Bell,
        keywords: ['warnings', 'low stock', 'expiry', 'notifications'],
        badge: 'alerts',
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        label: 'Products',
        to: '/products',
        icon: Package,
        keywords: ['catalog', 'sku', 'items', 'import', 'export'],
      },
      {
        label: 'Stock',
        to: '/stock',
        icon: Boxes,
        keywords: ['levels', 'positions', 'ledger', 'movements', 'batches', 'expiry', 'receive', 'adjust'],
      },
      { label: 'Transfers', to: '/transfers', icon: ArrowLeftRight, keywords: ['move', 'warehouse', 'ship'] },
      {
        label: 'Cycle counts',
        to: '/cycle-counts',
        icon: ClipboardCheck,
        keywords: ['stocktake', 'count', 'variance', 'audit'],
      },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Suppliers', to: '/suppliers', icon: Factory, keywords: ['vendors', 'scorecard'] },
      {
        label: 'Purchase orders',
        to: '/purchase-orders',
        icon: Receipt,
        keywords: ['po', 'buy', 'order', 'receiving', 'grn'],
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Sales orders',
        to: '/sales-orders',
        icon: ShoppingCart,
        keywords: ['so', 'orders', 'fulfil', 'ship'],
      },
      { label: 'Customers', to: '/customers', icon: Users, keywords: ['clients', 'buyers'] },
    ],
  },
  {
    label: 'Agents',
    items: [
      {
        label: 'Agents',
        to: '/agents',
        icon: Bot,
        keywords: ['ai', 'automation', 'runs', 'sentinel', 'planner', 'schedule', 'autonomy'],
      },
      {
        label: 'Approvals',
        to: '/approvals',
        icon: Inbox,
        keywords: ['proposals', 'inbox', 'approve', 'reject', 'decisions'],
        badge: 'approvals',
      },
      {
        label: 'Assistant',
        to: '/assistant',
        icon: MessagesSquare,
        keywords: ['chat', 'ask', 'question', 'ai', 'help'],
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        label: 'Audit log',
        to: '/audit',
        icon: History,
        permission: 'audit.view',
        keywords: ['history', 'changes', 'who'],
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        label: 'Settings',
        to: '/settings',
        icon: Settings,
        keywords: [
          'preferences',
          'theme',
          'password',
          'account',
          'warehouses',
          'categories',
          'units',
          'reasons',
        ],
      },
      { label: 'Design system', to: '/design', icon: Palette, keywords: ['components', 'tokens', 'ui'] },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { label: 'About', to: '/about', icon: Info, keywords: ['version', 'help'] },
];
