import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn, initials } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden {...props} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hairline-strong bg-surface px-1',
        'font-sans text-[11px] font-medium text-fg-secondary',
        className,
      )}
      {...props}
    />
  );
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      className={cn('shrink-0 bg-hairline', vertical ? 'h-full w-px' : 'h-px w-full', className)}
    />
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft select-none',
        className,
      )}
    >
      <AvatarPrimitive.Fallback className="text-xs font-semibold text-accent-text" delayMs={0}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
