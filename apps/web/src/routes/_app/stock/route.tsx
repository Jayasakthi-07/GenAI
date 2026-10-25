import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, PackageX, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { type StockOp, StockOperationDialog } from '@/features/stock/operation-dialogs';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/stock')({
  staticData: { title: 'Stock' },
  component: StockLayout,
});

const SECTIONS = [
  { to: '/stock', label: 'Levels', exact: true },
  { to: '/stock/movements', label: 'Movements', exact: false },
  { to: '/stock/batches', label: 'Batches & expiry', exact: false },
] as const;

function StockLayout() {
  const can = useCan();
  const [op, setOp] = useState<StockOp | null>(null);
  return (
    <ListPage>
      <PageHeader
        title="Stock"
        description="What’s on hand in every warehouse, every change to it, and what’s about to expire."
        actions={
          can('stock.operate') && (
            <>
              <Button variant="primary" onClick={() => setOp('receive')}>
                <ArrowDownToLine strokeWidth={1.75} /> Receive
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    More <ChevronDown className="opacity-60" strokeWidth={1.75} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setOp('issue')}>
                    <ArrowUpFromLine /> Issue stock
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOp('adjust')}>
                    <SlidersHorizontal /> Adjust stock
                  </DropdownMenuItem>
                  {can('stock.write_off') && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setOp('write-off')}>
                        <PackageX /> Write off
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />
      <nav
        aria-label="Stock views"
        className="-mt-2 mb-4 flex shrink-0 gap-1 overflow-x-auto border-b border-hairline"
      >
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            activeOptions={{ exact: s.exact, includeSearch: false }}
            className={cn(
              '-mb-px inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-fg-secondary transition-colors hover:text-fg',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            )}
            activeProps={{ className: '!border-accent !text-fg' }}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <Outlet />
      <StockOperationDialog op={op} onClose={() => setOp(null)} />
    </ListPage>
  );
}
