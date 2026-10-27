import { Tabs as TabsPrimitive, ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      // pb-px leaves room for the triggers' -1px margin, which would otherwise add a vertical scrollbar.
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-hairline pb-px', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap',
        'text-fg-secondary transition-colors duration-150 hover:text-fg',
        'data-[state=active]:border-accent data-[state=active]:text-fg',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5 outline-none', className)} {...props} />;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; ariaLabel?: string }>;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label': string;
}

/** Compact mutually exclusive choice (e.g. 7d / 30d / 90d, light / dark / system). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-neutral-soft p-0.5', className)}
      {...aria}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium text-fg-secondary',
            'transition-[background-color,color,box-shadow] duration-150 hover:text-fg',
            'data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_0.5px_var(--hairline)]',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] [&_svg]:size-4',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm',
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
