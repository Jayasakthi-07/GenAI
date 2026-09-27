import { TriangleAlert, RotateCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** The helpful next step (usually a Button). */
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-8' : 'gap-3 py-16',
        className,
      )}
    >
      <div className="grid size-11 place-items-center rounded-full bg-neutral-soft text-fg-secondary [&_svg]:size-5">
        {icon}
      </div>
      <div className="max-w-sm">
        <p className="text-base font-semibold tracking-tight">{title}</p>
        {description && <p className="mt-1 text-sm text-fg-secondary">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ErrorState({
  error,
  onRetry,
  title = 'Couldn’t load this',
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-8' : 'gap-3 py-16',
        className,
      )}
    >
      <div className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-5" strokeWidth={1.75} />
      </div>
      <div className="max-w-md">
        <p className="text-base font-semibold tracking-tight">{title}</p>
        <p className="mt-1 text-sm text-fg-secondary">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}
