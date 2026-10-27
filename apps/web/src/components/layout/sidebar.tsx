import { APP_VERSION } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { actionCountsQuery } from '@/features/agents/api';
import { alertCountsQuery } from '@/features/alerts/api';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { FOOTER_NAV, NAV, type NavItem, useNavFilter } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { IconButton } from '../ui/button';
import { Tooltip } from '../ui/menus';
import { BrandMark, BrandName } from './brand';

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = isActive(pathname, item.to);
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        active ? 'bg-accent-soft text-accent-text' : 'text-fg-secondary hover:bg-neutral-soft hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon
        className={cn(
          'size-[18px] shrink-0',
          active ? 'text-accent-text' : 'text-fg-tertiary group-hover:text-fg-secondary',
        )}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {item.badge === 'alerts' && <AlertsBadge collapsed={collapsed} />}
      {item.badge === 'approvals' && <ApprovalsBadge collapsed={collapsed} />}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** Proposals waiting for a decision; hidden when there are none. */
function ApprovalsBadge({ collapsed }: { collapsed: boolean }) {
  const { data } = useQuery(actionCountsQuery);
  const n = data?.pending ?? 0;
  if (!n) return null;
  return collapsed ? (
    <span
      className="absolute top-1 right-1.5 size-2 rounded-full bg-accent ring-2 ring-[var(--material-solid)]"
      aria-label={`${n} proposals awaiting approval`}
    />
  ) : (
    <span
      className="ml-auto rounded-full bg-accent-soft px-1.5 tabular text-xs font-semibold text-accent-text"
      aria-label={`${n} proposals awaiting approval`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Urgent (critical + high) open alerts; hidden when there are none. */
function AlertsBadge({ collapsed }: { collapsed: boolean }) {
  const { data } = useQuery(alertCountsQuery);
  const urgent = (data?.bySeverity.CRITICAL ?? 0) + (data?.bySeverity.HIGH ?? 0);
  if (!urgent) return null;
  return collapsed ? (
    <span
      className="absolute top-1 right-1.5 size-2 rounded-full bg-danger ring-2 ring-[var(--material-solid)]"
      aria-label={`${urgent} urgent alerts`}
    />
  ) : (
    <span
      className="ml-auto rounded-full bg-danger-soft px-1.5 tabular text-xs font-semibold text-danger"
      aria-label={`${urgent} urgent alerts`}
    >
      {urgent > 99 ? '99+' : urgent}
    </span>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

export function SidebarContent({ collapsed = false, onToggle, onNavigate, className }: SidebarProps) {
  const visible = useNavFilter();
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && <BrandName />}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Main">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-5">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-hairline" aria-hidden />
              ) : (
                <p className="mb-1 px-2.5 text-xs font-medium text-fg-tertiary">{group.label}</p>
              )}
              <div className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={cn('flex shrink-0 flex-col gap-0.5 border-t border-hairline px-3 py-3')}>
        {FOOTER_NAV.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <div
          className={cn('mt-1 flex items-center justify-between px-2.5', collapsed && 'justify-center px-0')}
        >
          {!collapsed && <span className="text-xs text-fg-tertiary">Version {APP_VERSION}</span>}
          {onToggle && (
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              size="sm"
              onClick={onToggle}
            >
              {collapsed ? <PanelLeftOpen strokeWidth={1.75} /> : <PanelLeftClose strokeWidth={1.75} />}
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    // The outer column carries the background for the full page height; the inner panel stays in view.
    <aside
      className={cn(
        'hidden shrink-0 border-r border-hairline material transition-[width] duration-200 ease-out lg:block',
        collapsed ? 'w-[64px]' : 'w-[240px]',
      )}
    >
      <div className="sticky top-0 h-dvh">
        <SidebarContent collapsed={collapsed} onToggle={onToggle} />
      </div>
    </aside>
  );
}
