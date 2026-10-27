import {
  formatNumber,
  SIMULATION_SCENARIO_INFO,
  SIMULATION_SCENARIOS,
  SIMULATION_SPEEDS,
  SIMULATION_TICK_SECONDS,
  type SimulationScenario,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import {
  CalendarClock,
  FlaskConical,
  PackageMinus,
  PartyPopper,
  Play,
  Square,
  TrendingDown,
  Truck,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { actionCountsQuery } from '@/features/agents/api';
import { AgentActivityCard } from '@/features/dashboard/briefing-cards';
import {
  simulationQuery,
  useRunScenario,
  useSimulationSpeed,
  useStartSimulation,
  useStopSimulation,
} from '@/features/simulation/api';
import { ResetDemoButton } from '@/features/simulation/reset-demo';
import { meQueryOptions } from '@/lib/auth';
import { addDays, date, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/simulation')({
  staticData: { title: 'Simulation' },
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me?.permissions.includes('simulation.control')) throw redirect({ to: '/' });
  },
  component: SimulationPage,
});

const ICONS: Record<SimulationScenario, typeof PartyPopper> = {
  festive_rush: PartyPopper,
  supplier_delay: Truck,
  shrinkage: PackageMinus,
  demand_drop: TrendingDown,
};
const SPEED_LABELS: Record<number, string> = { 1: 'Slow', 2: 'Normal', 4: 'Fast', 8: 'Fastest' };

/** "1 simulated day every 30 s" for a speed in simulated hours per tick. */
const pace = (speed: number) => {
  const seconds = (24 / speed) * SIMULATION_TICK_SECONDS;
  return seconds >= 60 ? `${seconds / 60} min` : `${seconds} s`;
};
const simulated = (hours: number) => {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return d ? `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}` : `${h} h`;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function SimulationPage() {
  const q = useQuery(simulationQuery);
  const approvals = useQuery(actionCountsQuery);
  const start = useStartSimulation();
  const stop = useStopSimulation();
  const speed = useSimulationSpeed();
  const scenario = useRunScenario();
  const s = q.data;

  const run = (key: SimulationScenario) =>
    scenario.mutate(key, {
      onSuccess: () =>
        toast.success(SIMULATION_SCENARIO_INFO[key].label, {
          description: SIMULATION_SCENARIO_INFO[key].reaction,
        }),
      onError: (e) => reportError(e, undefined, 'Couldn’t start the scenario'),
    });

  const yesterday = addDays(-1);
  const stale = s?.lastSalesDay && s.lastSalesDay < yesterday;

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="Simulation"
        description="A live sandbox for demonstrations. Customers buy and suppliers deliver on their own, at a speed you choose, and the agents react exactly as they would to real activity."
        actions={
          s?.available && (
            <>
              <ResetDemoButton />
              {s.running ? (
                <Button
                  variant="secondary"
                  loading={stop.isPending}
                  onClick={() => stop.mutate(undefined, { onError: (e) => reportError(e) })}
                >
                  <Square strokeWidth={1.75} /> Stop
                </Button>
              ) : (
                <Button
                  loading={start.isPending}
                  onClick={() =>
                    start.mutate(undefined, { onError: (e) => reportError(e, undefined, 'Couldn’t start') })
                  }
                >
                  <Play strokeWidth={1.75} /> Start
                </Button>
              )}
            </>
          )
        }
      />

      {q.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn’t read the simulator" />
        </Card>
      ) : !s?.available ? (
        <Card>
          <EmptyState
            icon={<FlaskConical strokeWidth={1.75} />}
            title="The simulator is off"
            description="It only runs in demo mode, so it can never touch real data. Set DEMO_MODE=true in .env and restart Stockroom to use it."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {stale && (
            <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 sm:flex-row sm:items-center">
              <TriangleAlert className="size-5 shrink-0 text-warning" strokeWidth={1.75} />
              <p className="flex-1 text-sm">
                The demo history ends on <strong>{date(s.lastSalesDay)}</strong>, so recent days show no
                sales. Reset the demo data for history up to yesterday, or start the simulator to add sales
                from now on.
              </p>
              <ResetDemoButton />
            </div>
          )}

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {s.running ? (
                    <StatusPill tone="success" pulse>
                      Running
                    </StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Stopped</StatusPill>
                  )}
                  {s.running ? `${simulated(s.simulatedHours)} simulated` : 'Ready'}
                </CardTitle>
                <CardDescription>
                  {SPEED_LABELS[s.speed] ?? `${s.speed} h`}: one simulated day every {pace(s.speed)}. Sales
                  are recorded at real times, so today absorbs the activity; deliveries arrive after the
                  supplier’s lead time at the same pace.
                </CardDescription>
              </div>
              <SegmentedControl
                aria-label="Speed"
                value={String(s.speed)}
                onValueChange={(v) => speed.mutate(Number(v), { onError: (e) => reportError(e) })}
                options={SIMULATION_SPEEDS.map((v) => ({
                  value: String(v),
                  label: SPEED_LABELS[v] ?? `${v} h`,
                  ariaLabel: `${SPEED_LABELS[v]}: one simulated day every ${pace(v)}`,
                }))}
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Sales orders" value={formatNumber(s.stats.orders)} />
                <Stat label="Units sold" value={formatNumber(s.stats.units)} />
                <Stat label="Revenue" value={money(s.stats.revenue)} />
                <Stat label="Orders sent" value={formatNumber(s.stats.sentOrders)} />
                <Stat label="Deliveries" value={formatNumber(s.stats.receipts)} />
                <Stat label="Losses recorded" value={formatNumber(s.stats.adjustments)} />
              </dl>
              {s.scenario && (
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft px-4 py-3">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.75} />
                  <p className="text-sm">
                    <span className="font-medium">{s.scenario.label}.</span> {s.scenario.detail}
                    {s.scenario.hoursLeft > 0 && ` ${simulated(s.scenario.hoursLeft)} to go.`}
                  </p>
                </div>
              )}
              {s.lastError && (
                <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
                  The last tick failed: {s.lastError}
                </p>
              )}
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 text-base font-semibold tracking-tight">Scenarios</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SIMULATION_SCENARIOS.map((key) => {
                const info = SIMULATION_SCENARIO_INFO[key];
                const Icon = ICONS[key];
                const active = s.scenario?.key === key && s.scenario.hoursLeft > 0;
                return (
                  <Card key={key} className={cn('flex flex-col', active && 'border-accent')}>
                    <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                          <Icon className="size-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-semibold">
                            {info.label}
                            {active && (
                              <StatusPill tone="accent" pulse>
                                Active
                              </StatusPill>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm text-fg-secondary">{info.description}</p>
                        </div>
                      </div>
                      <p className="text-sm text-fg-tertiary">{info.reaction}</p>
                      <div className="mt-auto">
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={scenario.isPending && scenario.variables === key}
                          disabled={scenario.isPending}
                          onClick={() => run(key)}
                        >
                          {active
                            ? 'Run again'
                            : key === 'shrinkage'
                              ? 'Record the losses'
                              : 'Start scenario'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AgentActivityCard />
            </div>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Your part</CardTitle>
                  <CardDescription>Agents propose; people decide.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatNumber(approvals.data?.pending ?? 0)}
                </p>
                <p className="text-sm text-fg-secondary">
                  proposals waiting for approval. Approve a purchase order and the simulator sends it to the
                  supplier, then receives it when it’s due.
                </p>
                <Button asChild variant="secondary" size="sm" className="self-start">
                  <Link to="/approvals">Open approvals</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
