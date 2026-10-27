import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMe } from '@/lib/auth';
import { PasswordFields, usePasswordForm } from './password-form';

/**
 * Shown after signing in with a temporary password an admin set: choose your own before going
 * on. It can't be dismissed; signing out is the only other way out.
 */
export function MustChangePasswordDialog({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useMe();
  const { form, onSubmit, pending } = usePasswordForm(() =>
    toast.success('Password set', { description: 'Use it the next time you sign in.' }),
  );
  return (
    <Dialog open={user.mustChangePassword}>
      <DialogContent
        hideClose
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <span className="mb-2 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-text">
              <KeyRound className="size-5" strokeWidth={1.75} />
            </span>
            <DialogTitle>Choose your own password</DialogTitle>
            <DialogDescription>
              An admin set a temporary password for {user.email}. Pick one only you know to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <PasswordFields form={form} currentLabel="Temporary password" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onSignOut}>
              Sign out
            </Button>
            <Button type="submit" loading={pending}>
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
