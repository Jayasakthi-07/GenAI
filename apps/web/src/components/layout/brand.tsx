import { APP_NAME } from '@stockroom/shared';
import { cn } from '@/lib/utils';

/** App mark: a simple isometric box in the accent colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 11.5 16 8l7 3.5v9L16 24l-7-3.5z"
        fill="none"
        stroke="var(--accent-fg)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 11.5 16 15l7-3.5M16 15v9"
        fill="none"
        stroke="var(--accent-fg)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn('text-[15px] font-semibold tracking-tight text-fg', className)}>{APP_NAME}</span>
  );
}
