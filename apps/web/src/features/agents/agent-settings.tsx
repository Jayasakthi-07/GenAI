import {
  AGENT_EVENT_LABELS,
  AGENT_EVENTS,
  type AgentDto,
  type AgentEvent,
  type AgentLimits,
  type AgentTriggers,
  AUTONOMIES,
  AUTONOMY_DESCRIPTIONS,
  AUTONOMY_LABELS,
  type Autonomy,
  type ModelRefDto,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { modelsQuery } from '@/features/ai/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useUpdateAgent } from './api';
import { describeCron } from './ui';

interface Draft {
  autonomy: Autonomy;
  model: ModelRefDto | null;
  triggers: AgentTriggers;
  limits: AgentLimits;
  systemPrompt: string;
}

const fromAgent = (a: AgentDto): Draft => ({
  autonomy: a.autonomy,
  model: a.modelOverride,
  triggers: { ...a.triggers, cron: [...a.triggers.cron], events: [...a.triggers.events] },
  limits: { ...a.limits },
  systemPrompt: a.systemPrompt,
});
const modelValue = (m: ModelRefDto | null) => (m ? `${m.providerKey}::${m.modelId}` : 'default');
const CRON_SHAPE = /^(\S+\s+){4}\S+$/;

/** Everything people may tune about an agent. Tools, analyzers and hand-offs stay in code. */
export function AgentSettings({ agent: a }: { agent: AgentDto }) {
  const can = useCan();
  const editable = can('agents.configure');
  const update = useUpdateAgent(a.key);
  const models = useQuery({ ...modelsQuery({}), enabled: editable });
  const [draft, setDraft] = useState<Draft>(() => fromAgent(a));
  const [base, setBase] = useState(a);
  // Server data changed (saved here or elsewhere): start again from it.
  if (base !== a) {
    setBase(a);
    setDraft(fromAgent(a));
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(fromAgent(a));
  const cronsValid = draft.triggers.cron.every((c) => CRON_SHAPE.test(c.trim()));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setLimit = (key: keyof AgentLimits, value: string) =>
    setDraft((d) => ({ ...d, limits: { ...d.limits, [key]: Math.max(0, Math.round(Number(value) || 0)) } }));
  const setTriggers = (patch: Partial<AgentTriggers>) =>
    setDraft((d) => ({ ...d, triggers: { ...d.triggers, ...patch } }));

  const save = () =>
    update.mutate(
      {
        autonomy: draft.autonomy,
        modelOverride: draft.model,
        triggers: { ...draft.triggers, cron: draft.triggers.cron.map((c) => c.trim()) },
        limits: draft.limits,
        systemPrompt: draft.systemPrompt.trim() === a.defaultPrompt.trim() ? null : draft.systemPrompt,
      },
      {
        onSuccess: () => toast.success(`${a.name} settings saved`),
        onError: (e) => reportError(e, undefined, 'Couldn’t save the settings'),
      },
    );

  const modelOptions = [
    { value: 'default', label: 'Default routing' },
    ...(models.data?.models ?? [])
      .filter((m) => !m.capabilities.embedding)
      .map((m) => ({
        value: `${m.provider}::${m.id}`,
        label: `${m.id} · ${m.provider}${m.capabilities.tools === false ? ' · JSON protocol' : ''}`,
      })),
  ];
  if (draft.model && !modelOptions.some((o) => o.value === modelValue(draft.model)))
    modelOptions.push({
      value: modelValue(draft.model),
      label: `${draft.model.modelId} · ${draft.model.providerKey}`,
    });

  return (
    <div className="flex flex-col gap-4">
      {!editable && (
        <p className="flex items-center gap-2 rounded-md bg-neutral-soft px-3 py-2 text-sm text-fg-secondary">
          <Lock className="size-4" strokeWidth={1.75} /> Only managers and admins can change agents.
        </p>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Autonomy</CardTitle>
            <CardDescription>How far the agent may go on its own.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Autonomy" className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {AUTONOMIES.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={draft.autonomy === level}
                disabled={!editable}
                onClick={() => set('autonomy', level)}
                className={cn(
                  'rounded-lg border p-3.5 text-left transition-colors disabled:cursor-default',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                  draft.autonomy === level
                    ? 'border-accent bg-accent-soft'
                    : 'border-hairline hover:border-hairline-strong',
                )}
              >
                <span className="block text-sm font-semibold">{AUTONOMY_LABELS[level]}</span>
                <span className="mt-1 block text-xs text-fg-secondary">{AUTONOMY_DESCRIPTIONS[level]}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>When it runs</CardTitle>
            <CardDescription>
              Scheduled and event-triggered runs skip the model when nothing changed since the last result.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Schedule</p>
            {draft.triggers.cron.length === 0 && <p className="text-sm text-fg-secondary">No schedule.</p>}
            {draft.triggers.cron.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Schedule ${i + 1}`}
                  value={c}
                  disabled={!editable}
                  onChange={(e) =>
                    setTriggers({ cron: draft.triggers.cron.map((x, j) => (j === i ? e.target.value : x)) })
                  }
                  aria-invalid={!CRON_SHAPE.test(c.trim()) || undefined}
                  className="w-44 font-mono"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    CRON_SHAPE.test(c.trim()) ? 'text-fg-secondary' : 'text-danger',
                  )}
                >
                  {CRON_SHAPE.test(c.trim())
                    ? describeCron(c)
                    : 'Use five fields: minute hour day month weekday'}
                </span>
                {editable && (
                  <IconButton
                    label="Remove schedule"
                    onClick={() => setTriggers({ cron: draft.triggers.cron.filter((_, j) => j !== i) })}
                  >
                    <Trash2 strokeWidth={1.75} />
                  </IconButton>
                )}
              </div>
            ))}
            {editable && draft.triggers.cron.length < 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setTriggers({ cron: [...draft.triggers.cron, '0 9 * * *'] })}
              >
                <Plus strokeWidth={1.75} /> Add a schedule
              </Button>
            )}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Also run after</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AGENT_EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.triggers.events.includes(e)}
                    disabled={!editable}
                    onCheckedChange={(v) =>
                      setTriggers({
                        events: v
                          ? [...draft.triggers.events, e]
                          : draft.triggers.events.filter((x: AgentEvent) => x !== e),
                      })
                    }
                  />
                  {AGENT_EVENT_LABELS[e]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Wait for changes to settle"
            hint="Seconds to collect a burst of changes into one run"
            className="w-60"
          >
            <Input
              type="number"
              min={0}
              max={3600}
              disabled={!editable || draft.triggers.events.length === 0}
              value={draft.triggers.debounceSeconds}
              onChange={(e) =>
                setTriggers({ debounceSeconds: Math.max(0, Math.round(Number(e.target.value) || 0)) })
              }
              className="text-right tabular"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Model and limits</CardTitle>
            <CardDescription>
              The default follows Settings → AI & models. If no model answers, the run falls back to rules.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Model for this agent">
            <Select
              value={modelValue(draft.model)}
              disabled={!editable}
              onValueChange={(v) => {
                if (v === 'default') return set('model', null);
                const [providerKey = '', modelId = ''] = v.split('::');
                set('model', { providerKey, modelId });
              }}
              options={modelOptions}
              className="w-full max-w-md"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Model calls">
              <Input
                type="number"
                min={1}
                max={30}
                disabled={!editable}
                value={draft.limits.maxSteps}
                onChange={(e) => setLimit('maxSteps', e.target.value)}
                className="text-right tabular"
              />
            </Field>
            <Field label="Tool calls">
              <Input
                type="number"
                min={1}
                max={60}
                disabled={!editable}
                value={draft.limits.maxToolCalls}
                onChange={(e) => setLimit('maxToolCalls', e.target.value)}
                className="text-right tabular"
              />
            </Field>
            <Field label="Time limit (s)">
              <Input
                type="number"
                min={10}
                max={1800}
                disabled={!editable}
                value={Math.round(draft.limits.timeoutMs / 1000)}
                onChange={(e) => setLimit('timeoutMs', String(Number(e.target.value) * 1000))}
                className="text-right tabular"
              />
            </Field>
            {a.writes && (
              <>
                <Field label="Proposals per run">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    disabled={!editable}
                    value={draft.limits.maxActionsPerRun}
                    onChange={(e) => setLimit('maxActionsPerRun', e.target.value)}
                    className="text-right tabular"
                  />
                </Field>
                <Field label="Act-mode PO limit (₹)">
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    disabled={!editable}
                    value={draft.limits.maxPoValueInr}
                    onChange={(e) => setLimit('maxPoValueInr', e.target.value)}
                    className="text-right tabular"
                  />
                </Field>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>
              The agent’s prompt. Rules about using only computed numbers and tools are always added after it.
            </CardDescription>
          </div>
          {editable && draft.systemPrompt.trim() !== a.defaultPrompt.trim() && (
            <Button variant="ghost" size="sm" onClick={() => set('systemPrompt', a.defaultPrompt)}>
              <RotateCcw strokeWidth={1.75} /> Restore default
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Instructions"
            rows={9}
            disabled={!editable}
            value={draft.systemPrompt}
            onChange={(e) => set('systemPrompt', e.target.value)}
            className="text-sm"
          />
        </CardContent>
      </Card>

      {editable && dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-4 z-10 flex animate-slide-in-bottom flex-wrap items-center gap-3 rounded-xl border border-hairline px-4 py-3 shadow-float material"
        >
          <p className="text-sm text-fg-secondary">
            {cronsValid ? 'You have unsaved changes.' : 'Fix the schedule before saving.'}
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setDraft(fromAgent(a))}>
              Discard
            </Button>
            <Button
              variant="primary"
              disabled={!cronsValid || draft.systemPrompt.trim().length < 20}
              loading={update.isPending}
              onClick={save}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
