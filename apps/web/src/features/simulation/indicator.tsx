import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { Tooltip } from '@/components/ui/menus';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { simulationQuery } from './api';

/** In the top bar while the simulator runs, so nobody mistakes simulated sales for real ones. */
export function SimulationIndicator() {
  const can = useCan();
  const { data } = useQuery({ ...simulationQuery, enabled: can('inventory.view') });
  if (!data?.running) return null;
  const label = data.scenario?.hoursLeft ? data.scenario.label : 'Simulating';
  const pill = (
    <span
      className={cn(
        'inline-flex h-8 max-w-48 items-center gap-1.5 rounded-full bg-warning-soft px-3 text-xs font-medium text-warning',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="hidden truncate sm:inline">{label}</span>
    </span>
  );
  return (
    <Tooltip content="The simulator is creating sales and deliveries. Open the Simulation page to stop it.">
      {can('simulation.control') ? (
        <Link to="/simulation" aria-label={`${label}: open the simulator`} className="rounded-full">
          {pill}
        </Link>
      ) : (
        <span role="status" aria-label={label}>
          {pill}
        </span>
      )}
    </Tooltip>
  );
}
