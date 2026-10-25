import type { ColumnVisibilityState } from '@tanstack/react-table';
import { Check, ChevronDown, Columns3, ListFilter, Rows3, Rows4, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui/menus';
import { Kbd } from '@/components/ui/misc';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

export function Toolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex shrink-0 flex-wrap items-center gap-2 pb-3', className)}>{children}</div>;
}

/** Search box bound to the URL: updates after a short pause; "/" focuses it. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value ?? '');
  const [synced, setSynced] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  // Follow outside changes (back button, cleared filters).
  if (value !== synced) {
    setSynced(value);
    setText(value ?? '');
  }

  useEffect(() => {
    if ((value ?? '') === text) return;
    const t = setTimeout(() => latest.current(text.trim() || undefined), 250);
    return () => clearTimeout(t);
  }, [text, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== '/' || target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.preventDefault();
            setText('');
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        leading={<Search strokeWidth={1.75} />}
        trailing={
          text ? (
            <IconButton label="Clear search" size="sm" onClick={() => setText('')}>
              <X strokeWidth={1.75} />
            </IconButton>
          ) : (
            <Kbd className="hidden sm:inline-flex">/</Kbd>
          )
        }
        className="[&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
  hint?: string;
}

/** A filter chip: shows the active choice(s) and opens a checklist. */
export function FilterMenu({
  label,
  options,
  value,
  onChange,
  multiple = true,
  searchable,
}: {
  label: string;
  options: FilterOption[];
  value: string[] | string | undefined;
  onChange: (value: string[] | undefined) => void;
  multiple?: boolean;
  searchable?: boolean;
}) {
  const selected = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const [query, setQuery] = useState('');
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`;

  const toggle = (v: string) => {
    if (!multiple) return onChange(selected[0] === v ? undefined : [v]);
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    onChange(next.length ? next : undefined);
  };

  return (
    <Popover onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            'border-dashed',
            summary && 'border-solid border-accent/40 bg-accent-soft text-accent-text hover:bg-accent-soft',
          )}
        >
          <ListFilter strokeWidth={1.75} />
          <span>{label}</span>
          {summary && (
            <>
              <span className="h-3.5 w-px bg-current opacity-30" aria-hidden />
              <span className="max-w-40 truncate font-semibold">{summary}</span>
            </>
          )}
          <ChevronDown className="opacity-60" strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1">
        {searchable && (
          <div className="p-1 pb-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Find ${label.toLowerCase()}…`}
              autoFocus
              className="h-8"
            />
          </div>
        )}
        <div
          role="listbox"
          aria-multiselectable={multiple}
          aria-label={label}
          className="max-h-72 overflow-y-auto"
        >
          {shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'grid size-4 shrink-0 place-items-center border border-hairline-strong',
                    multiple ? 'rounded-[4px]' : 'rounded-full',
                    on && 'border-accent bg-accent text-accent-fg',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="tabular text-xs text-fg-tertiary">{o.hint}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-2.5 py-3 text-sm text-fg-tertiary">No matches</p>}
        </div>
        {selected.length > 0 && (
          <div className="mt-1 border-t border-hairline p-1">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-fg-secondary hover:bg-neutral-soft hover:text-fg"
            >
              Clear {label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ClearFilters({ show, onClear }: { show: boolean; onClear: () => void }) {
  if (!show) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      <X strokeWidth={1.75} />
      Clear
    </Button>
  );
}

/** Show/hide columns; remembered per table on this device. */
export function ColumnsMenu({
  columns,
  visibility,
  onChange,
}: {
  columns: Array<{ id: string; label: string; required?: boolean }>;
  visibility: ColumnVisibilityState;
  onChange: (v: ColumnVisibilityState) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip content="Columns">
        <DropdownMenuTrigger asChild>
          <IconButton label="Choose columns">
            <Columns3 strokeWidth={1.75} />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {columns
          .filter((c) => !c.required)
          .map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={visibility[c.id] !== false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => onChange({ ...visibility, [c.id]: checked })}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DensityToggle() {
  const { preferences, setPreference } = usePreferences();
  const compact = preferences.density === 'compact';
  return (
    <Tooltip content={compact ? 'Comfortable rows' : 'Compact rows'}>
      <IconButton
        label={compact ? 'Use comfortable rows' : 'Use compact rows'}
        onClick={() => setPreference('density', compact ? 'comfortable' : 'compact')}
      >
        {compact ? <Rows3 strokeWidth={1.75} /> : <Rows4 strokeWidth={1.75} />}
      </IconButton>
    </Tooltip>
  );
}

/** Column visibility persisted per table in this browser (a per-viewer convenience). */
export function useColumnVisibility(tableId: string, defaults: ColumnVisibilityState = {}) {
  const key = `stockroom.columns.${tableId}`;
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(() => {
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as ColumnVisibilityState) };
    } catch {
      return defaults;
    }
  });
  const update = (next: ColumnVisibilityState) => {
    setVisibility(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Not remembered; still applies for this visit.
    }
  };
  return [visibility, update] as const;
}
