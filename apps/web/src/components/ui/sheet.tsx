import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

type Side = 'right' | 'left' | 'bottom';

const sideClasses: Record<Side, string> = {
  right: 'inset-y-2 right-2 w-[calc(100vw-16px)] max-w-md animate-slide-in-right rounded-xl',
  left: 'inset-y-0 left-0 w-[min(300px,85vw)] animate-slide-in-left rounded-r-xl',
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] animate-slide-in-bottom rounded-t-xl',
};

/** Side sheet for quick views and forms. Translucent material, like the sidebar. */
export function SheetContent({
  side = 'right',
  className,
  children,
  hideClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: Side; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border border-hairline shadow-float material outline-none',
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute top-4 right-4 rounded-md p-1 text-fg-tertiary transition-colors hover:bg-neutral-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            aria-label="Close"
          >
            <X className="size-[18px]" strokeWidth={1.75} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-hairline px-5 py-4 pr-12', className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-fg-secondary', className)} {...props} />;
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex justify-end gap-2 border-t border-hairline px-5 py-3', className)} {...props} />
  );
}
