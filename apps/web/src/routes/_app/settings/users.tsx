import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type UserListItem,
  userCreateSchema,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { KeyRound, MoreHorizontal, Pencil, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { useCreateUser, useResetPassword, useUpdateUser, usersQuery } from '@/features/settings/api';
import { meQueryOptions, useMe } from '@/lib/auth';
import { ago } from '@/lib/format';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/users')({
  staticData: { title: 'Users & roles' },
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me?.permissions.includes('users.manage')) throw redirect({ to: '/settings/organization' });
  },
  component: UsersSettings,
});

function UsersSettings() {
  const q = useQuery(usersQuery);
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [resetting, setResetting] = useState<UserListItem | null>(null);
  const update = useUpdateUser();

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              New users get a temporary password and are asked to change it when they first sign in.
            </CardDescription>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <UserPlus strokeWidth={1.75} /> Add user
          </Button>
        </CardHeader>
        {q.isPending ? (
          <div className="flex flex-col gap-2 p-5 pt-0">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <ul className="divide-y divide-hairline border-t border-hairline">
            {q.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} className={u.isActive ? '' : 'opacity-50'} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {u.name}
                    {u.id === me.user.id && <Badge tone="accent">You</Badge>}
                    {!u.isActive && <Badge>Deactivated</Badge>}
                    {u.mustChangePassword && u.isActive && <Badge tone="warning">Temporary password</Badge>}
                  </p>
                  <p className="truncate text-xs text-fg-tertiary">
                    {u.email} · {u.lastLoginAt ? `signed in ${ago(u.lastLoginAt)}` : 'never signed in'}
                  </p>
                </div>
                <span className="hidden text-sm text-fg-secondary sm:block">{ROLE_LABELS[u.role]}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton label={`Actions for ${u.name}`}>
                      <MoreHorizontal strokeWidth={1.75} />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditing(u)}>
                      <Pencil /> Edit name and role
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setResetting(u)}>
                      <KeyRound /> Reset password…
                    </DropdownMenuItem>
                    {u.id !== me.user.id && (
                      <DropdownMenuItem
                        destructive={u.isActive}
                        onSelect={() =>
                          update.mutate(
                            { id: u.id, name: u.name, role: u.role, isActive: !u.isActive },
                            {
                              onSuccess: () =>
                                toast.success(
                                  u.isActive
                                    ? `${u.name} deactivated and signed out`
                                    : `${u.name} re-activated`,
                                ),
                              onError: (e) => reportError(e, undefined, 'Couldn’t update the user'),
                            },
                          )
                        }
                      >
                        <UserX /> {u.isActive ? 'Deactivate' : 'Re-activate'}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold tracking-tight">Roles</h3>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          {ROLES.map((r) => (
            <div key={r} className="grid grid-cols-[90px_1fr] gap-3">
              <dt className="font-medium">{ROLE_LABELS[r]}</dt>
              <dd className="text-fg-secondary">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} self={editing?.id === me.user.id} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

type CreateValues = z.input<typeof userCreateSchema>;

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser();
  const form = useForm<CreateValues, unknown, z.output<typeof userCreateSchema>>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { email: '', name: '', role: 'STAFF', password: '' },
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((v) =>
    create.mutate(v, {
      onSuccess: (u) => {
        toast.success(`Added ${u.name}`, { description: 'Share the temporary password with them securely.' });
        form.reset();
        onOpenChange(false);
      },
      onError: (err) => reportError(err, form, 'Couldn’t add the user'),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={(ev) => void submit(ev)} noValidate>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" required error={e.name?.message}>
              <Input {...register('name')} autoFocus />
            </Field>
            <Field label="Email" required error={e.email?.message}>
              <Input type="email" {...register('email')} autoComplete="off" />
            </Field>
            <Field label="Role" required error={e.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={ROLES.map((r) => ({
                      value: r,
                      label: ROLE_LABELS[r],
                      description: ROLE_DESCRIPTIONS[r],
                    }))}
                  />
                )}
              />
            </Field>
            <Field
              label="Temporary password"
              required
              error={e.password?.message}
              hint="10+ characters with a letter and a number"
            >
              <Input
                type="text"
                {...register('password')}
                autoComplete="new-password"
                className="font-mono"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onClose,
  self,
}: {
  user: UserListItem | null;
  onClose: () => void;
  self: boolean;
}) {
  const update = useUpdateUser();
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserListItem['role']>('STAFF');
  const [active, setActive] = useState(true);
  const [key, setKey] = useState<string | null>(null);
  if (user && key !== user.id) {
    setKey(user.id);
    setName(user.name);
    setRole(user.role);
    setActive(user.isActive);
  }
  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && (onClose(), setKey(null))}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user) return;
            update.mutate(
              { id: user.id, name, role, isActive: active },
              {
                onSuccess: () => (toast.success('User saved'), onClose(), setKey(null)),
                onError: (err) => reportError(err, undefined, 'Couldn’t save'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {user?.name}</DialogTitle>
            <DialogDescription>Changing the role signs them out so new permissions apply.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Role" hint={self ? 'You can’t change your own role.' : undefined}>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UserListItem['role'])}
                disabled={self}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              />
            </Field>
            {!self && (
              <label className="flex items-center justify-between text-sm">
                <span className="font-medium">Active</span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserListItem | null; onClose: () => void }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const valid = password.length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && (onClose(), setPassword(''))}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user || !valid) return;
            reset.mutate(
              { id: user.id, password },
              {
                onSuccess: () => {
                  toast.success(`${user.name}’s password was reset`, {
                    description: 'They’ve been signed out and must change it at next sign-in.',
                  });
                  onClose();
                  setPassword('');
                },
                onError: (err) => reportError(err, undefined, 'Couldn’t reset the password'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset {user?.name}’s password</DialogTitle>
            <DialogDescription>
              They’re signed out everywhere and must choose a new password next time.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Temporary password" required hint="10+ characters with a letter and a number">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
                autoComplete="new-password"
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={reset.isPending} disabled={!valid}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
