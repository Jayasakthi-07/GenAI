import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-soft text-fg-secondary',
        accent: 'bg-accent-soft text-accent-text',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        outline: 'border border-hairline-strong text-fg-secondary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const dot: Record<StatusTone, string> = {
  neutral: 'bg-fg-tertiary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const pill: Record<StatusTone, string> = {
  neutral: 'bg-neutral-soft text-fg-secondary',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** Rounded status label with a leading dot, used for record states in tables and headers. */
export function StatusPill({
  tone = 'neutral',
  pulse = false,
  className,
  children,
}: {
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap',
        pill[tone],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot[tone], pulse && 'animate-pulse-dot')} aria-hidden />
      {children}
    </span>
  );
}
