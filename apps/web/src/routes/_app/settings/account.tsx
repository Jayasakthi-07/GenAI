import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  PASSWORD_MIN_LENGTH,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { ApiError } from '@/lib/api';
import { useChangePassword, useMe } from '@/lib/auth';

export const Route = createFileRoute('/_app/settings/account')({
  staticData: { title: 'Account' },
  component: AccountSettings,
});

function AccountSettings() {
  const { user, organization } = useMe();
  const change = useChangePassword();
  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        form.reset();
        toast.success('Password changed', { description: 'Your other sessions were signed out.' });
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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <Avatar name={user.name} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">{user.name}</p>
            <p className="truncate text-sm text-fg-secondary">{user.email}</p>
            <p className="mt-1 text-sm text-fg-tertiary">{organization.name}</p>
          </div>
          <Badge tone="accent">{ROLE_LABELS[user.role]}</Badge>
        </CardContent>
        <CardFooter className="text-sm text-fg-secondary">{ROLE_DESCRIPTIONS[user.role]}</CardFooter>
      </Card>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardHeader>
            <div>
              <CardTitle>Change password</CardTitle>
              <CardDescription>You’ll stay signed in here; other devices will be signed out.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
              <Input type="password" autoComplete="current-password" {...form.register('currentPassword')} />
            </Field>
            <Field
              label="New password"
              hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
              error={form.formState.errors.newPassword?.message}
            >
              <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
            </Field>
            <Field label="Confirm new password" error={form.formState.errors.confirmPassword?.message}>
              <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
            </Field>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" variant="primary" loading={change.isPending}>
              Change password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
