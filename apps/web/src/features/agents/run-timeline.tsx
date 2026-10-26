import type { AgentStepDto, StepType } from '@stockroom/shared';
import {
  ArrowRightLeft,
  Brain,
  Calculator,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileText,
  type LucideIcon,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { duration } from './ui';

const STEP: Record<StepType, { icon: LucideIcon; tone: string; title: string }> = {
  ANALYSIS: { icon: Calculator, tone: 'bg-neutral-soft text-fg-secondary', title: 'Analysis (code)' },
  CONTEXT: { icon: FileText, tone: 'bg-neutral-soft text-fg-secondary', title: 'Briefing' },
  LLM_CALL: { icon: Sparkles, tone: 'bg-accent-soft text-accent-text', title: 'Model' },
  THINKING: { icon: Brain, tone: 'bg-accent-soft text-accent-text', title: 'Reasoning' },
  TOOL_CALL: { icon: Wrench, tone: 'bg-neutral-soft text-fg', title: 'Tool' },
  VALIDATION_ERROR: { icon: TriangleAlert, tone: 'bg-warning-soft text-warning', title: 'Corrected' },
  HANDOFF: { icon: ArrowRightLeft, tone: 'bg-accent-soft text-accent-text', title: 'Hand-off' },
  FINAL: { icon: CircleCheck, tone: 'bg-success-soft text-success', title: 'Answer' },
  ERROR: { icon: CircleX, tone: 'bg-danger-soft text-danger', title: 'Error' },
};

/** What a running agent is doing now, given the last step it finished. */
function nextActivity(last: StepType | undefined): string {
  switch (last) {
    case undefined:
      return 'Analyzing…';
    case 'ANALYSIS':
      return 'Preparing the briefing…';
    case 'CONTEXT':
    case 'TOOL_CALL':
    case 'VALIDATION_ERROR':
      return 'Waiting for the model…';
    case 'LLM_CALL':
      return 'Running tools…';
    default:
      return 'Finishing…';
  }
}

const pretty = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

/** Every step of a run, oldest first: what the code found, what the model asked for, what came back. */
export function RunTimeline({ steps, running }: { steps: AgentStepDto[]; running: boolean }) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => (
        <StepRow key={s.id} step={s} last={i === steps.length - 1 && !running} />
      ))}
      {running && (
        <li className="flex items-center gap-3 py-2 pl-1 text-sm text-fg-secondary" aria-live="polite">
          <span className="grid size-7 place-items-center">
            <Spinner />
          </span>
          {nextActivity(steps.at(-1)?.type)}
        </li>
      )}
    </ol>
  );
}

function StepRow({ step: s, last }: { step: AgentStepDto; last: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = STEP[s.type];
  const Icon = meta.icon;
  const hasDetail = Boolean(s.content || s.reasoning || s.input || s.output || s.error);
  const llm =
    s.type === 'LLM_CALL'
      ? (s.output as {
          tokens?: { prompt: number | null; completion: number | null };
          protocol?: string;
          fallback?: boolean;
        } | null)
      : null;
  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-hairline" aria-hidden />}
      <span
        className={cn('z-[1] grid size-7 shrink-0 place-items-center rounded-full', meta.tone)}
        aria-hidden
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <button
          type="button"
          disabled={!hasDetail}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={hasDetail ? open : undefined}
          className="group flex w-full items-start gap-2 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1">
            <span className="text-xs font-medium tracking-wide text-fg-tertiary uppercase">{meta.title}</span>
            <span className="block text-sm text-fg">{s.label}</span>
            {s.error && !open && <span className="block truncate text-xs text-danger">{s.error}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 pt-4 tabular text-xs text-fg-tertiary">
            {llm?.tokens?.completion ? `${llm.tokens.completion} tok · ` : ''}
            {s.durationMs !== null && duration(s.durationMs)}
            {hasDetail && (
              <ChevronRight
                className={cn('size-4 transition-transform duration-150', open && 'rotate-90')}
                strokeWidth={1.75}
                aria-hidden
              />
            )}
          </span>
        </button>
        {open && (
          <div className="mt-2 flex flex-col gap-2">
            {llm && (
              <p className="text-xs text-fg-tertiary">
                {llm.protocol === 'json' ? 'JSON protocol (no native tool calls)' : 'Native tool calling'}
                {llm.fallback ? ' · served by a fallback model' : ''}
              </p>
            )}
            {s.error && <Block title="Problem" text={s.error} tone="danger" />}
            {s.reasoning && <Block title="Model reasoning" text={s.reasoning} />}
            {s.content && (
              <Block title={s.type === 'CONTEXT' ? 'What the model was told' : 'Text'} text={s.content} />
            )}
            {s.input !== null && s.input !== undefined && <Block title="Input" text={pretty(s.input)} mono />}
            {s.output !== null && s.output !== undefined && (
              <Block title="Result" text={pretty(s.output)} mono />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Block({
  title,
  text,
  mono,
  tone,
}: {
  title: string;
  text: string;
  mono?: boolean;
  tone?: 'danger';
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-fg-secondary">{title}</p>
      <pre
        className={cn(
          'max-h-80 overflow-auto rounded-md bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap',
          mono ? 'font-mono' : 'font-sans',
          tone === 'danger' && 'text-danger',
        )}
      >
        {text}
      </pre>
    </div>
  );
}
