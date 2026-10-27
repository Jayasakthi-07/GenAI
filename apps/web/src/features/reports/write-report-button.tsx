import { REPORT_TYPE_LABELS, type ReportType } from '@stockroom/shared';
import { useRouter } from '@tanstack/react-router';
import { CalendarDays, CalendarRange, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { useWriteReport } from './api';

/** "Write one now" for the Report Writer, on the Reports page and the dashboard. */
export function WriteReportButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const can = useCan();
  const write = useWriteReport();
  const router = useRouter();
  if (!can('agents.run')) return null;
  const start = (type: ReportType) =>
    write.mutate(type, {
      onSuccess: (r) =>
        toast.success(
          r.deduped
            ? 'The Report Writer is already on it'
            : `Writing the ${REPORT_TYPE_LABELS[type].toLowerCase()}`,
          {
            description: 'It appears here and under the bell when it’s ready, usually within a minute.',
            action: {
              label: 'Watch',
              onClick: () => void router.navigate({ to: '/agents/runs/$id', params: { id: r.runId } }),
            },
          },
        ),
      onError: (e) => reportError(e, undefined, 'Couldn’t start the Report Writer'),
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} loading={write.isPending}>
          <PenLine strokeWidth={1.75} /> Write one now
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => start('DAILY_BRIEFING')}>
          <CalendarDays /> Daily briefing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => start('WEEKLY_SUMMARY')}>
          <CalendarRange /> Weekly summary
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
