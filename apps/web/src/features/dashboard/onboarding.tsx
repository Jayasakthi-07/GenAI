import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { Check, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { aiStatusQuery } from '@/features/ai/api';
import { runsQuery, useRunAgent } from '@/features/agents/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

interface Step {
  title: string;
  detail: React.ReactNode;
  done: boolean;
  action: React.ReactNode;
}

/** First run: connect a model → review the agents → run a first analysis. Dismissible. */
export function OnboardingChecklist() {
  const can = useCan();
  const router = useRouter();
  const { preferences, setPreference } = usePreferences();
  const ai = useQuery(aiStatusQuery);
  const manual = useQuery(runsQuery({ trigger: 'MANUAL', status: 'SUCCEEDED', pageSize: 1 }));
  const run = useRunAgent();
  const onboarding = preferences.onboarding;
  if (onboarding.dismissed || !can('agents.run') || ai.isPending || manual.isPending) return null;

  const set = (patch: Partial<typeof onboarding>) => setPreference('onboarding', { ...onboarding, ...patch });
  const aiReady = ai.data?.mode === 'AI';
  const steps: Step[] = [
    {
      title: aiReady ? `Connected to ${ai.data?.active?.displayName ?? 'a model'}` : 'Connect a model',
      detail: aiReady ? (
        'Agents use it to explain what they find and to weigh their proposals. The numbers always come from Stockroom.'
      ) : (
        <>
          Agents already work without one: they follow rules and label their output “Rule-based”. Ollama runs
          free on this computer; cloud providers need a key.
        </>
      ),
      done: aiReady,
      action: can('ai.configure') ? (
        <Button asChild size="sm" variant="secondary">
          <Link to="/settings/ai">Set up AI</Link>
        </Button>
      ) : (
        <span className="text-sm text-fg-tertiary">Ask an admin to connect one.</span>
      ),
    },
    {
      title: 'Review your agents',
      detail: 'See what each one watches, how much it may do on its own, and when it runs.',
      done: onboarding.reviewedAgents,
      action: (
        <Button asChild size="sm" variant="secondary">
          <Link to="/agents" onClick={() => set({ reviewedAgents: true })}>
            Open agents
          </Link>
        </Button>
      ),
    },
    {
      title: 'Run the first analysis',
      detail:
        'The Stock Sentinel checks every product in every warehouse and hands low stock to the Planner.',
      done: onboarding.ranAnalysis || (manual.data?.meta.total ?? 0) > 0,
      action: (
        <Button
          size="sm"
          loading={run.isPending}
          onClick={() =>
            run.mutate(
              { key: 'stock_sentinel' },
              {
                onSuccess: (r) => {
                  set({ ranAnalysis: true });
                  toast.success('The Stock Sentinel is on it', {
                    action: {
                      label: 'Watch',
                      onClick: () =>
                        void router.navigate({ to: '/agents/runs/$id', params: { id: r.runId } }),
                    },
                  });
                },
                onError: (e) => reportError(e, undefined, 'Couldn’t start the Stock Sentinel'),
              },
            )
          }
        >
          <Play strokeWidth={1.75} /> Run now
        </Button>
      ),
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{completed === steps.length ? 'You’re all set' : 'Get started'}</CardTitle>
          <CardDescription>
            {completed === steps.length
              ? 'The agents are watching. Their findings appear in Alerts and their proposals in Approvals.'
              : `${completed} of ${steps.length} done. Three steps to put the agents to work.`}
          </CardDescription>
        </div>
        <IconButton label="Hide the checklist" onClick={() => set({ dismissed: true })}>
          <X strokeWidth={1.75} />
        </IconButton>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-4',
                s.done ? 'border-hairline bg-neutral-soft/50' : 'border-hairline',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                    s.done ? 'bg-success text-white' : 'bg-accent-soft text-accent-text',
                  )}
                  aria-hidden
                >
                  {s.done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <p className="font-medium">
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </p>
              </div>
              <p className="text-sm text-fg-secondary">{s.detail}</p>
              {!s.done && <div className="mt-auto pt-1">{s.action}</div>}
            </li>
          ))}
        </ol>
        {completed === steps.length && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => set({ dismissed: true })}>
              Done
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
