import { Check } from 'lucide-react';
import { DropdownMenu as Menu, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const floating =
  'z-50 rounded-lg border border-hairline bg-elevated shadow-float animate-scale-in outline-none';

/* ── Popover ─────────────────────────────────────────────────────────────── */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = 'start',
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(floating, 'w-72 p-4', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ── Dropdown menu ───────────────────────────────────────────────────────── */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(floating, 'min-w-48 p-1', className)}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClasses = cn(
  'relative flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm text-fg outline-none select-none',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft',
  '[&_svg]:size-4 [&_svg]:text-fg-secondary',
);

export function DropdownMenuItem({
  className,
  destructive,
  shortcut,
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { destructive?: boolean; shortcut?: string }) {
  return (
    <Menu.Item
      className={cn(
        itemClasses,
        destructive && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
        className,
      )}
      asChild={asChild}
      {...props}
    >
      {/* With asChild the item merges into its one child (a link), so nothing may sit beside it. */}
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {shortcut && <span className="ml-auto text-xs text-fg-tertiary">{shortcut}</span>}
        </>
      )}
    </Menu.Item>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClasses, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5 flex">
        <Check className="size-4 !text-accent-text" strokeWidth={2} />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemClasses, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5 flex">
        <Check className="size-4 !text-accent-text" strokeWidth={2} />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn('px-2.5 pt-2 pb-1 text-xs font-medium text-fg-tertiary', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-hairline', className)} {...props} />;
}

/* ── Tooltip ─────────────────────────────────────────────────────────────── */
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  side = 'top',
  children,
}: {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs animate-fade-in rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-float"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
