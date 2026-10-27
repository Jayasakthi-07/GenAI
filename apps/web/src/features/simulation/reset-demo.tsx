import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { useResetDemo } from './api';

/** "Reset demo data" with its confirmation. Admins only; it replaces every record. */
export function ResetDemoButton({ variant = 'secondary' }: { variant?: 'secondary' | 'danger' }) {
  const can = useCan();
  const reset = useResetDemo();
  const [open, setOpen] = useState(false);
  if (!can('demo.reset')) return null;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <RotateCcw strokeWidth={1.75} /> Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !reset.isPending && setOpen(o)}
        title="Reset the demo data?"
        tone="danger"
        confirmLabel={reset.isPending ? 'Resetting…' : 'Reset'}
        loading={reset.isPending}
        description={
          <>
            Every product, order, movement, alert, proposal, report and agent run is replaced with a fresh 18
            months of demo history ending yesterday. AI providers, model routing and agent settings stay as
            they are, and everyone stays signed in. It takes about a minute.
          </>
        }
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: (r) => {
              setOpen(false);
              toast.success('Demo data reset', {
                description: `Fresh history up to yesterday, loaded in ${Math.round(r.seconds)} s. The Stock Sentinel is taking a first look.`,
              });
            },
            onError: (e) => reportError(e, undefined, 'Couldn’t reset the demo data'),
          })
        }
      />
    </>
  );
}
