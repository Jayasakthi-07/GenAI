import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Primary action on the right. */
  actions?: React.ReactNode;
  /** Small line above the title (breadcrumb, status). */
  eyebrow?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-fg-secondary">{eyebrow}</div>}
        <h2 className="text-2xl font-semibold tracking-tighter text-fg sm:text-3xl">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-base text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard page container: generous gutters, max width for readability on large screens. */
export function Page({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8', className)}
      {...props}
    />
  );
}
