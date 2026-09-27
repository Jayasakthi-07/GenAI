import { Label as LabelPrimitive } from 'radix-ui';
import { cloneElement, isValidElement, useId } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-fg', className)} {...props} />;
}

interface FieldProps {
  label: string;
  /** Short help shown under the control. */
  hint?: string;
  /** Validation message; also marks the control aria-invalid. */
  error?: string;
  required?: boolean;
  className?: string;
  /** Rendered to the right of the label (e.g. "Forgot password?"). */
  aside?: React.ReactNode;
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label + control + hint/error, wired up for accessibility. */
export function Field({ label, hint, error, required, className, aside, children }: FieldProps) {
  const id = useId();
  const controlId = children.props.id ?? id;
  const messageId = `${controlId}-message`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? messageId : undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={controlId}>
          {label}
          {required && (
            <span className="ml-0.5 text-fg-tertiary" aria-hidden>
              *
            </span>
          )}
        </Label>
        {aside}
      </div>
      {control}
      {(error || hint) && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-danger' : 'text-fg-tertiary')}
          role={error ? 'alert' : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
