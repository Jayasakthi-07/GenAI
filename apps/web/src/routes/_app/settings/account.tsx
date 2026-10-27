import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { PasswordFields, usePasswordForm } from '@/features/account/password-form';
import { useMe } from '@/lib/auth';

export const Route = createFileRoute('/_app/settings/account')({
  staticData: { title: 'Account' },
  component: AccountSettings,
});

function AccountSettings() {
  const { user, organization } = useMe();
  const { form, onSubmit, pending } = usePasswordForm(() =>
    toast.success('Password changed', { description: 'Your other sessions were signed out.' }),
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
            <PasswordFields form={form} />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              Change password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
