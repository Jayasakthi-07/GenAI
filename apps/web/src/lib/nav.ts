import type { Permission } from '@stockroom/shared';
import { Info, LayoutDashboard, Palette, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Extra words for the command palette. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Only pages that exist are listed; groups (Inventory, Purchasing, Sales,
 * AI Agents, Insights) are added here as their pages ship.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, keywords: ['home', 'kpi', 'overview'] }],
  },
  {
    label: 'Settings',
    items: [
      {
        label: 'Settings',
        to: '/settings',
        icon: Settings,
        keywords: ['preferences', 'theme', 'password', 'account'],
      },
      { label: 'Design system', to: '/design', icon: Palette, keywords: ['components', 'tokens', 'ui'] },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { label: 'About', to: '/about', icon: Info, keywords: ['version', 'help'] },
];
