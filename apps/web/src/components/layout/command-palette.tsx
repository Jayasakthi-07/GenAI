import type { SearchKind, SearchResult } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  ArrowLeftRight,
  ClipboardCheck,
  Factory,
  LogOut,
  Monitor,
  Moon,
  Package,
  PackagePlus,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';
import { assistantPanel } from '@/features/assistant/panel-store';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { FOOTER_NAV, NAV } from '@/lib/nav';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { Kbd } from '../ui/misc';
import { Spinner } from '../ui/spinner';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}

const itemClasses = cn(
  'flex h-10 cursor-default items-center gap-3 rounded-md px-3 text-sm text-fg select-none',
  'data-[selected=true]:bg-accent-soft [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-fg-tertiary',
);
const groupClasses =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-tertiary';

const KIND: Record<SearchKind, { icon: LucideIcon; label: string }> = {
  product: { icon: Package, label: 'Product' },
  supplier: { icon: Factory, label: 'Supplier' },
  customer: { icon: Users, label: 'Customer' },
  purchase_order: { icon: Receipt, label: 'Purchase order' },
  sales_order: { icon: ShoppingCart, label: 'Sales order' },
  transfer: { icon: ArrowLeftRight, label: 'Transfer' },
  cycle_count: { icon: ClipboardCheck, label: 'Cycle count' },
};

function useDebounced(value: string, ms = 180) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** ⌘K / Ctrl+K: jump anywhere, find any record, run common actions. */
export function CommandPalette({ open, onOpenChange, onSignOut }: CommandPaletteProps) {
  const navigate = useNavigate();
  const can = useCan();
  const { setPreference } = usePreferences();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const results = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.get<SearchResult[]>('/search', { q }, signal),
    enabled: open && q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        assistantPanel.open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    setText('');
    fn();
  };

  const openRecord = (r: SearchResult) =>
    run(() => {
      switch (r.kind) {
        case 'product':
          return void navigate({ to: '/products/$id', params: { id: r.id } });
        case 'supplier':
          return void navigate({ to: '/suppliers/$id', params: { id: r.id } });
        case 'customer':
          return void navigate({ to: '/sales-orders', search: { customerId: r.id } });
        case 'purchase_order':
          return void navigate({ to: '/purchase-orders/$id', params: { id: r.id } });
        case 'sales_order':
          return void navigate({ to: '/sales-orders/$id', params: { id: r.id } });
        case 'transfer':
          return void navigate({ to: '/transfers/$id', params: { id: r.id } });
        case 'cycle_count':
          return void navigate({ to: '/cycle-counts/$id', params: { id: r.id } });
      }
    });

  const pages = [...NAV.flatMap((g) => g.items), ...FOOTER_NAV].filter(
    (i) => !i.permission || can(i.permission),
  );
  const records = q.length >= 2 ? (results.data ?? []) : [];
  const actions: Array<{ label: string; icon: LucideIcon; go: () => void; keywords: string }> = [];
  if (can('catalog.manage'))
    actions.push({
      label: 'New product',
      icon: PackagePlus,
      go: () => void navigate({ to: '/products/new' }),
      keywords: 'create add sku',
    });
  if (can('purchase_orders.create'))
    actions.push({
      label: 'New purchase order',
      icon: Receipt,
      go: () => void navigate({ to: '/purchase-orders/new' }),
      keywords: 'create po buy order',
    });
  if (can('sales_orders.create'))
    actions.push({
      label: 'New sales order',
      icon: ShoppingCart,
      go: () => void navigate({ to: '/sales-orders/new' }),
      keywords: 'create so sell',
    });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setText('');
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 animate-scale-in overflow-hidden rounded-xl border border-hairline bg-elevated shadow-float outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search className="size-[18px] shrink-0 text-fg-tertiary" strokeWidth={1.75} />
              <Command.Input
                autoFocus
                value={text}
                onValueChange={setText}
                placeholder="Search records, pages and actions…"
                className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-tertiary"
              />
              {results.isFetching && q.length >= 2 && <Spinner className="size-4" />}
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(460px,62vh)] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-fg-secondary">
                {results.isFetching ? 'Searching…' : 'No matches.'}
              </Command.Empty>
              {text.trim().length >= 3 && (
                <Command.Group heading="Assistant" className={groupClasses}>
                  <Command.Item
                    value={`ask assistant ${text}`}
                    onSelect={() => run(() => assistantPanel.ask(text.trim()))}
                    className={itemClasses}
                  >
                    <Sparkles strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">
                      Ask the Assistant: <span className="text-fg-secondary">“{text.trim()}”</span>
                    </span>
                  </Command.Item>
                </Command.Group>
              )}
              {records.length > 0 && (
                <Command.Group heading="Records" className={groupClasses}>
                  {records.map((r) => {
                    const Icon = KIND[r.kind].icon;
                    return (
                      <Command.Item
                        key={`${r.kind}-${r.id}`}
                        value={`${text} ${r.title} ${r.subtitle} ${r.id}`}
                        onSelect={() => openRecord(r)}
                        className={itemClasses}
                      >
                        <Icon strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 truncate">
                          {r.title} <span className="text-fg-tertiary">· {r.subtitle}</span>
                        </span>
                        <span className="shrink-0 text-xs text-fg-tertiary">{KIND[r.kind].label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {actions.length > 0 && (
                <Command.Group heading="Actions" className={groupClasses}>
                  {actions.map((a) => (
                    <Command.Item
                      key={a.label}
                      value={`${a.label} ${a.keywords}`}
                      onSelect={() => run(a.go)}
                      className={itemClasses}
                    >
                      <a.icon strokeWidth={1.75} />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className={groupClasses}>
                {pages.map((item) => (
                  <Command.Item
                    key={item.to}
                    value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => run(() => void navigate({ to: item.to }))}
                    className={itemClasses}
                  >
                    <item.icon strokeWidth={1.75} />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Appearance" className={groupClasses}>
                <Command.Item
                  value="Light theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'light'))}
                  className={itemClasses}
                >
                  <Sun strokeWidth={1.75} /> Use light theme
                </Command.Item>
                <Command.Item
                  value="Dark theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'dark'))}
                  className={itemClasses}
                >
                  <Moon strokeWidth={1.75} /> Use dark theme
                </Command.Item>
                <Command.Item
                  value="System theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'system'))}
                  className={itemClasses}
                >
                  <Monitor strokeWidth={1.75} /> Match system theme
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Account" className={groupClasses}>
                <Command.Item
                  value="Sign out log out"
                  onSelect={() => run(onSignOut)}
                  className={itemClasses}
                >
                  <LogOut strokeWidth={1.75} /> Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
