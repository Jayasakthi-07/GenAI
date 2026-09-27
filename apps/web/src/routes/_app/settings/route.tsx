import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Palette, UserRound } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings')({
  staticData: { title: 'Settings' },
  component: SettingsLayout,
});

const SECTIONS = [
  { to: '/settings/appearance', label: 'Appearance', icon: Palette },
  { to: '/settings/account', label: 'Account', icon: UserRound },
] as const;

function SettingsLayout() {
  return (
    <Page>
      <PageHeader title="Settings" description="Personal preferences and your account." />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label="Settings" className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col">
          {SECTIONS.map((section) => (
            <Link
              key={section.to}
              to={section.to}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-fg-secondary transition-colors',
                'hover:bg-neutral-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]',
              )}
              activeProps={{ className: '!bg-accent-soft !text-accent-text' }}
            >
              <section.icon className="size-4" strokeWidth={1.75} />
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="max-w-2xl min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </Page>
  );
}
