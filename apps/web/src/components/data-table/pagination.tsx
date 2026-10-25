import { formatNumber } from '@stockroom/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

const SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof SIZES)[number];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  noun = 'rows',
}: {
  page: number;
  pageSize: number;
  total: number | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
  noun?: string;
}) {
  if (total === undefined) return <div className="h-12" />;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex h-12 items-center justify-between gap-3 px-4 text-sm text-fg-secondary">
      <p className="tabular">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            <span className="text-fg">
              {formatNumber(from)}–{formatNumber(to)}
            </span>{' '}
            of {formatNumber(total)} {noun}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select
            aria-label="Rows per page"
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
            options={SIZES.map((s) => ({ value: String(s), label: `${s} per page` }))}
            className="hidden h-8 w-[132px] sm:flex"
          />
        )}
        <span className="hidden tabular sm:inline">
          Page {formatNumber(page)} of {formatNumber(pages)}
        </span>
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

/** "Load more" footer for cursor-paged lists (ledger, audit log). */
export function LoadMore({
  hasMore,
  loading,
  onLoad,
  shown,
  noun,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  shown: number;
  noun: string;
}) {
  return (
    <div className="flex h-12 items-center justify-between gap-3 px-4 text-sm text-fg-secondary">
      <p className="tabular">
        {formatNumber(shown)} {noun}
        {hasMore ? ' shown' : ''}
      </p>
      {hasMore && (
        <Button variant="secondary" size="sm" loading={loading} onClick={onLoad}>
          Load more
        </Button>
      )}
    </div>
  );
}

/** Floating bar for actions on selected rows. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-fit flex-wrap items-center gap-2 rounded-xl border border-hairline p-2 pl-4 shadow-float material"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="tabular text-sm font-medium">{formatNumber(count)} selected</span>
          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />
          {children}
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
