import { cn } from '@/lib/utils';

export type Density = 'comfortable' | 'compact';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        className={cn('w-full caption-bottom border-separate border-spacing-0 text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 [&_th]:bg-surface-2', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child_td]:border-b-0', className)} {...props} />;
}

export function TR({
  className,
  interactive,
  selected,
  ...props
}: React.ComponentProps<'tr'> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors duration-100',
        interactive && 'cursor-pointer hover:bg-surface-2',
        selected && 'bg-accent-soft hover:bg-accent-soft',
        className,
      )}
      aria-selected={selected || undefined}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'h-9 border-b border-hairline px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-fg-secondary',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  density = 'comfortable',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; density?: Density }) {
  return (
    <td
      className={cn(
        'border-b border-hairline px-4 align-middle text-fg',
        density === 'compact' ? 'h-9 py-1' : 'h-12 py-2',
        numeric && 'text-right tabular',
        className,
      )}
      {...props}
    />
  );
}
