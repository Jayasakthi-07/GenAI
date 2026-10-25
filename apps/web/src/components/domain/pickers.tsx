import { formatNumber, type MovementType, type ProductListItem, type ProductRef } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { ChevronsUpDown, PackageSearch, Search } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { controlClasses } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useReasonCodes, useWarehouses } from '@/features/catalog/api';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export type PickedProduct = ProductRef & {
  available?: number;
  costPrice?: string;
  sellingPrice?: string;
  taxRate?: string;
};

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface ProductPickerProps {
  value: PickedProduct | null;
  onChange: (product: PickedProduct) => void;
  /** Show availability at this warehouse and only offer products stocked there. */
  warehouseId?: string;
  /** Only products this supplier sells. */
  supplierId?: string;
  exclude?: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Searchable product picker (SKU, name, brand or barcode), backed by the products API. */
export const ProductPicker = forwardRef<HTMLButtonElement, ProductPickerProps>(function ProductPicker(
  {
    value,
    onChange,
    warehouseId,
    supplierId,
    exclude = [],
    placeholder = 'Choose a product…',
    className,
    ...aria
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const results = useQuery({
    queryKey: [...queryKeys.products.picker(q, warehouseId), supplierId],
    queryFn: ({ signal }) =>
      api.get<{ data: ProductListItem[] }>(
        '/products',
        { q, warehouseId, supplierId, status: 'ACTIVE', pageSize: 30, sort: 'name:asc' },
        signal,
      ),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const items = (results.data?.data ?? []).filter((p) => !exclude.includes(p.id));

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), !o && setText(''))}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          {...aria}
          className={cn(controlClasses, 'flex h-9 min-w-0 items-center gap-2 px-3 text-left', className)}
        >
          {value ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate">{value.name}</span>
              <span className="shrink-0 text-xs text-fg-tertiary">{value.sku}</span>
            </span>
          ) : (
            <span className="flex-1 truncate text-fg-tertiary">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-32px))] p-0" align="start">
        <Command shouldFilter={false} label="Products">
          <div className="flex items-center gap-2 border-b border-hairline px-3">
            <Search className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.75} />
            <Command.Input
              value={text}
              onValueChange={setText}
              placeholder="Search SKU, name or barcode…"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-tertiary"
            />
            {results.isFetching && <Spinner className="size-4" />}
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            {!results.isFetching && items.length === 0 && (
              <Command.Empty className="flex flex-col items-center gap-2 py-8 text-sm text-fg-secondary">
                <PackageSearch className="size-5 text-fg-tertiary" strokeWidth={1.75} />
                {warehouseId ? 'No matching products with stock here' : 'No matching products'}
              </Command.Empty>
            )}
            {items.map((p) => (
              <Command.Item
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onChange({
                    id: p.id,
                    sku: p.sku,
                    name: p.name,
                    unit: p.unit,
                    trackExpiry: p.trackExpiry,
                    available: p.available,
                    costPrice: p.costPrice,
                    sellingPrice: p.sellingPrice,
                    taxRate: p.taxRate,
                  });
                  setOpen(false);
                  setText('');
                }}
                className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm data-[selected=true]:bg-accent-soft"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{p.name}</p>
                  <p className="truncate text-xs text-fg-tertiary">
                    {p.sku} · {p.category.path}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 tabular text-xs',
                    p.available > 0 ? 'text-fg-secondary' : 'text-danger',
                  )}
                >
                  {formatNumber(p.available)} {p.unit}
                  {warehouseId ? ' here' : ''}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

export const WarehouseSelect = forwardRef<
  HTMLButtonElement,
  {
    value: string | undefined;
    onChange: (id: string) => void;
    exclude?: string;
    placeholder?: string;
    className?: string;
    id?: string;
  }
>(function WarehouseSelect({ value, onChange, exclude, placeholder = 'Choose a warehouse', ...rest }, ref) {
  const warehouses = useWarehouses();
  return (
    <Select
      ref={ref}
      value={value ?? ''}
      onValueChange={onChange}
      placeholder={placeholder}
      options={(warehouses.data ?? [])
        .filter((w) => w.isActive && w.id !== exclude)
        .map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
      {...rest}
    />
  );
});

/** Reason codes valid for a movement type and direction. */
export const ReasonSelect = forwardRef<
  HTMLButtonElement,
  {
    type: MovementType;
    direction?: 'IN' | 'OUT';
    value: string | undefined;
    onChange: (id: string) => void;
    className?: string;
    id?: string;
  }
>(function ReasonSelect({ type, direction, value, onChange, ...rest }, ref) {
  const reasons = useReasonCodes();
  const options = (reasons.data ?? [])
    .filter(
      (r) =>
        r.isActive &&
        r.appliesTo.includes(type) &&
        (!direction || r.direction === 'BOTH' || r.direction === direction),
    )
    .map((r) => ({ value: r.id, label: r.label }));
  // A reason that no longer fits (direction flipped) is cleared rather than silently kept.
  useEffect(() => {
    if (value && reasons.data && !options.some((o) => o.value === value)) onChange('');
  });
  return (
    <Select
      ref={ref}
      value={value ?? ''}
      onValueChange={onChange}
      placeholder="Choose a reason"
      options={options}
      {...rest}
    />
  );
});
