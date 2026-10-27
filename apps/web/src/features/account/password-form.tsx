import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  PASSWORD_MIN_LENGTH,
} from '@stockroom/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useChangePassword } from '@/lib/auth';

/** The change-password form's state and submit handler, shared by Account and the first-sign-in prompt. */
export function usePasswordForm(onDone: () => void) {
  const change = useChangePassword();
  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        form.reset();
        onDone();
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [field, message] of Object.entries(error.fields)) {
            form.setError(field as keyof ChangePasswordRequest, { message });
          }
          if (!Object.keys(error.fields).length) toast.error(error.message);
        } else {
          toast.error('Couldn’t change your password.');
        }
      },
    }),
  );
  return { form, onSubmit, pending: change.isPending };
}

export function PasswordFields({
  form,
  currentLabel = 'Current password',
}: {
  form: ReturnType<typeof usePasswordForm>['form'];
  currentLabel?: string;
}) {
  const errors = form.formState.errors;
  return (
    <>
      <Field label={currentLabel} error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('currentPassword')} />
      </Field>
      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
        error={errors.newPassword?.message}
      >
        <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
      </Field>
    </>
  );
}
