import type { Permission } from '@stockroom/shared';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import {
  Bell,
  Building2,
  DatabaseBackup,
  FolderTree,
  ListChecks,
  Palette,
  Ruler,
  Sparkles,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings')({
  staticData: { title: 'Settings' },
  component: SettingsLayout,
});

interface Section {
  to: string;
  label: string;
  icon: typeof Palette;
  permission?: Permission;
}

const GROUPS: Array<{ label: string; sections: Section[] }> = [
  {
    label: 'Personal',
    sections: [
      { to: '/settings/appearance', label: 'Appearance', icon: Palette },
      { to: '/settings/notifications', label: 'Notifications', icon: Bell },
      { to: '/settings/account', label: 'Account', icon: UserRound },
    ],
  },
  {
    label: 'Organization',
    sections: [
      { to: '/settings/organization', label: 'Organization', icon: Building2 },
      { to: '/settings/users', label: 'Users & roles', icon: Users, permission: 'users.manage' },
      { to: '/settings/ai', label: 'AI & models', icon: Sparkles, permission: 'agents.configure' },
      { to: '/settings/data', label: 'Import & export', icon: DatabaseBackup },
    ],
  },
  {
    label: 'Inventory',
    sections: [
      { to: '/settings/warehouses', label: 'Warehouses', icon: Warehouse },
      { to: '/settings/categories', label: 'Categories', icon: FolderTree },
      { to: '/settings/units', label: 'Units', icon: Ruler },
      { to: '/settings/reason-codes', label: 'Reason codes', icon: ListChecks },
    ],
  },
];

function SettingsLayout() {
  const can = useCan();
  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Your preferences, the organization, and the lists everything else is built on."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav
          aria-label="Settings"
          className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col lg:gap-5"
        >
          {GROUPS.map((g) => (
            <div key={g.label} className="flex gap-1 lg:flex-col lg:gap-0.5">
              <p className="hidden px-2.5 pb-1 text-xs font-medium text-fg-tertiary lg:block">{g.label}</p>
              {g.sections
                .filter((s) => !s.permission || can(s.permission))
                .map((s) => (
                  <Link
                    key={s.to}
                    to={s.to}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-fg-secondary transition-colors',
                      'hover:bg-neutral-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]',
                    )}
                    activeProps={{ className: '!bg-accent-soft !text-accent-text' }}
                  >
                    <s.icon className="size-4" strokeWidth={1.75} />
                    {s.label}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="max-w-4xl min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </Page>
  );
}
