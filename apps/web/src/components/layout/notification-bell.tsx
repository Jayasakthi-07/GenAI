import type { NotificationDto, NotificationType } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { Bell, BellRing, Bot, CheckCheck, FileText, Inbox, PackageCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { notificationsQuery, useMarkNotificationsRead } from '@/features/notifications/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/menus';
import { Skeleton } from '../ui/misc';

const ICONS: Record<NotificationType, typeof Bell> = {
  alert: TriangleAlert,
  approval: Inbox,
  run_failed: Bot,
  po_received: PackageCheck,
  report_ready: FileText,
};

function iconTone(n: NotificationDto) {
  if (n.type === 'alert' || n.type === 'run_failed')
    return n.severity === 'CRITICAL' || n.severity === 'HIGH'
      ? 'bg-danger-soft text-danger'
      : 'bg-warning-soft text-warning';
  if (n.type === 'po_received') return 'bg-success-soft text-success';
  return 'bg-accent-soft text-accent-text';
}

/** The top-bar bell: unread count, the latest notifications, and a way to clear them. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const query = useQuery(notificationsQuery);
  const markRead = useMarkNotificationsRead();
  const unread = query.data?.unread ?? 0;
  const items = query.data?.data ?? [];

  const openItem = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    setOpen(false);
    if (n.link) void router.navigate({ href: n.link });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          {unread ? <BellRing strokeWidth={1.75} /> : <Bell strokeWidth={1.75} />}
          {unread > 0 && (
            <span
              className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-fill px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
              aria-hidden
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-fg-tertiary">{unread ? `${unread} unread` : 'You’re all caught up'}</p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markRead.mutate({ all: true })}
              disabled={markRead.isPending}
            >
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>

        {query.isPending ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <p className="text-sm text-fg-secondary">Couldn’t load your notifications.</p>
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
            <Bell className="size-6 text-fg-tertiary" strokeWidth={1.5} />
            <p className="mt-1 text-sm font-medium">Nothing new</p>
            <p className="text-sm text-fg-secondary">
              Urgent alerts, proposals to approve and new briefings show up here.
            </p>
          </div>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] divide-y divide-hairline overflow-y-auto">
            {items.map((n) => {
              const Icon = ICONS[n.type];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-soft',
                      'focus-visible:bg-neutral-soft focus-visible:outline-none',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        iconTone(n),
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            n.readAt ? 'text-fg-secondary' : 'font-medium',
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-xs text-fg-tertiary tabular-nums">
                          {ago(n.createdAt)}
                        </span>
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-fg-secondary">{n.body}</span>
                      )}
                    </span>
                    {!n.readAt && (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-hairline px-4 py-2.5">
          <Link
            to="/settings/notifications"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-accent-text hover:underline"
          >
            Choose what you’re notified about
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
