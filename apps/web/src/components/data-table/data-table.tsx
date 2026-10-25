import {
  type ColumnDef,
  type ColumnVisibilityState,
  columnVisibilityFeature,
  createColumnHelper,
  type RowData,
  type RowSelectionState,
  rowSelectionFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/misc';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

export interface DataColumnMeta {
  /** Right-aligned tabular figures. */
  numeric?: boolean;
  /** Name in the Columns menu when the header isn't plain text. */
  label?: string;
  /** Extra classes for the header and body cells (widths, padding). */
  className?: string;
  /** Can't be hidden from the Columns menu. */
  required?: boolean;
}

// A type-only slot: tells TanStack Table what `columnDef.meta` holds.
const columnMeta: DataColumnMeta = {};
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  columnMeta,
});
export type DataTableFeatures = typeof dataTableFeatures;
// Column definitions mix value types; the table only needs the row type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TValue varies per column, as in TanStack's own examples
export type DataColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>;
export const columnHelper = <T extends RowData>() => createColumnHelper<DataTableFeatures, T>();

const VIRTUALIZE_FROM = 80;

interface DataTableProps<T extends RowData> {
  columns: Array<DataColumn<T>>;
  data: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading: boolean;
  /** Dim the rows while a new page or sort is loading. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: { icon: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode };
  /** Server sort as "field:dir"; the column id is the field. */
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  selection?: RowSelectionState;
  onSelectionChange?: (selection: RowSelectionState) => void;
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  onRowClick?: (row: T) => void;
  /** Stacked card for phones; without it the table scrolls sideways. */
  renderCard?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
  /** Accessible table name. */
  label: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}

const EMPTY: never[] = [];

/**
 * The app's data grid: server-side sort, row selection, column visibility, density, sticky header,
 * virtualised rows for long pages, and stacked cards on phones. Loading, empty and error states
 * are built in so every list behaves the same.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  getRowId,
  isLoading,
  isFetching,
  error,
  onRetry,
  empty,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  onRowClick,
  renderCard,
  footer,
  label,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const { preferences } = usePreferences();
  const density = preferences.density;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows: T[] = data ?? EMPTY;

  const sorting = useMemo<SortingState>(() => {
    if (!sort) return [];
    const [id, dir] = sort.split(':');
    return id ? [{ id, desc: dir === 'desc' }] : [];
  }, [sort]);

  const allColumns = useMemo<Array<DataColumn<T>>>(() => {
    if (!onSelectionChange) return columns;
    const select: DataColumn<T> = {
      id: '_select',
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-10 pr-0', required: true },
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v === true)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [select, ...columns];
  }, [columns, onSelectionChange]);

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data: rows,
    getRowId: (row) => getRowId(row),
    manualSorting: true,
    enableSorting: Boolean(onSortChange),
    enableRowSelection: Boolean(onSelectionChange),
    state: {
      sorting,
      rowSelection: selection ?? {},
      columnVisibility: columnVisibility ?? {},
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      onSortChange?.(first ? `${first.id}:${first.desc ? 'desc' : 'asc'}` : undefined);
    },
    onRowSelectionChange: (updater) => {
      const current = selection ?? {};
      onSelectionChange?.(typeof updater === 'function' ? updater(current) : updater);
    },
    onColumnVisibilityChange: (updater) => {
      const current = columnVisibility ?? {};
      onColumnVisibilityChange?.(typeof updater === 'function' ? updater(current) : updater);
    },
  });

  const tableRows = table.getRowModel().rows;
  const virtual = tableRows.length >= VIRTUALIZE_FROM;
  const rowHeight = density === 'compact' ? 37 : 49;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns fresh functions each render; this component opts out of compiler memoization.
  const virtualizer = useVirtualizer({
    count: virtual ? tableRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtual ? virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0) : 0;
  const visibleColumns = table.getVisibleLeafColumns().length;

  const bodyRows = virtual
    ? items.map((i) => ({ row: tableRows[i.index]!, index: i.index }))
    : tableRows.map((row, index) => ({ row, index }));
  const showSkeleton = isLoading && !data;
  const showError = Boolean(error) && !data;
  const showEmpty = !showSkeleton && !showError && rows.length === 0;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-card',
        className,
      )}
    >
      {/* Phone: stacked cards */}
      {renderCard && (
        <div className="md:hidden">
          {showSkeleton ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : showError ? (
            <ErrorState compact error={error} onRetry={onRetry} />
          ) : showEmpty ? (
            <EmptyState compact {...empty} />
          ) : (
            <ul
              className={cn('divide-y divide-hairline', isFetching && 'opacity-60 transition-opacity')}
              aria-label={label}
            >
              {rows.map((row) => {
                const id = getRowId(row);
                return (
                  <li key={id}>
                    {onRowClick ? (
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        onClick={() => onRowClick(row)}
                      >
                        {renderCard(row)}
                      </button>
                    ) : (
                      <div className="px-4 py-3">{renderCard(row)}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Tablet and desktop: the grid */}
      <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-auto', renderCard && 'hidden md:block')}>
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          aria-label={label}
          aria-busy={isFetching || undefined}
        >
          <THead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TH
                      key={header.id}
                      numeric={meta?.numeric}
                      className={cn('first:pl-5 last:pr-5', meta?.className)}
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'group -mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]',
                            meta?.numeric && 'flex-row-reverse',
                            sorted && 'text-fg',
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" strokeWidth={2} />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" strokeWidth={2} />
                          ) : (
                            <ChevronsUpDown
                              className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TH>
                  );
                })}
              </tr>
            ))}
          </THead>
          <tbody className={cn(isFetching && data && 'opacity-60 transition-opacity')}>
            {showSkeleton &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  {Array.from({ length: visibleColumns }, (_, j) => (
                    <TD key={j} density={density} className="first:pl-5 last:pr-5">
                      <Skeleton className={cn('h-4', j === 0 ? 'w-40' : 'w-16')} />
                    </TD>
                  ))}
                </tr>
              ))}
            {showError && (
              <tr>
                <td colSpan={visibleColumns}>
                  <ErrorState error={error} onRetry={onRetry} />
                </td>
              </tr>
            )}
            {showEmpty && (
              <tr>
                <td colSpan={visibleColumns}>
                  <EmptyState {...empty} />
                </td>
              </tr>
            )}
            {padTop > 0 && (
              <tr aria-hidden>
                <td colSpan={visibleColumns} style={{ height: padTop }} />
              </tr>
            )}
            {bodyRows.map(({ row, index }) => (
              <TR
                key={row.id}
                ref={virtual ? virtualizer.measureElement : undefined}
                data-index={index}
                interactive={Boolean(onRowClick)}
                selected={row.getIsSelected()}
                className={cn('[&:last-child_td]:border-b-0', rowClassName?.(row.original))}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row.original);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TD
                      key={cell.id}
                      density={density}
                      numeric={meta?.numeric}
                      className={cn('first:pl-5 last:pr-5', meta?.className)}
                    >
                      <table.FlexRender cell={cell} />
                    </TD>
                  );
                })}
              </TR>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={visibleColumns} style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer && !showError && <div className="shrink-0 border-t border-hairline">{footer}</div>}
    </div>
  );
}
