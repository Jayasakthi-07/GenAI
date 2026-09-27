import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const controlClasses = cn(
  'w-full rounded-md border border-hairline-strong bg-surface text-sm text-fg shadow-card',
  'transition-[border-color,box-shadow] duration-150 placeholder:text-fg-tertiary',
  'hover:border-[color-mix(in_srgb,var(--hairline-strong)_60%,var(--fg-tertiary))]',
  'focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger-soft',
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon shown inside the field on the left. */
  leading?: React.ReactNode;
  /** Content shown inside the field on the right (unit, button, …). */
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leading, trailing, type = 'text', ...props }, ref) => {
    if (!leading && !trailing) {
      return <input ref={ref} type={type} className={cn(controlClasses, 'h-9 px-3', className)} {...props} />;
    }
    return (
      <div className="relative flex w-full items-center">
        {leading && (
          <span className="pointer-events-none absolute left-3 flex text-fg-tertiary [&_svg]:size-4">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(controlClasses, 'h-9 px-3', leading && 'pl-9', trailing && 'pr-10', className)}
          {...props}
        />
        {trailing && (
          <span className="absolute right-2 flex items-center text-fg-tertiary [&_svg]:size-4">
            {trailing}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlClasses, 'min-h-20 resize-y px-3 py-2 leading-5', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
