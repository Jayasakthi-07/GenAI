import type { ChatMessageDto, ChatPart } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowUp, CircleAlert, CircleCheck, LoaderCircle, Sparkles, Square, Wrench } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AiMarker } from '@/components/ai/ai-marker';
import { ErrorState } from '@/components/feedback/states';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { aiStatusQuery } from '@/features/ai/api';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { conversationQuery } from './api';
import { ChatChartView } from './chat-chart';
import { ConfirmationCardView } from './confirmation-card';
import { Markdown } from './markdown';
import { type LiveTool, useChat } from './use-chat';

const SUGGESTIONS = [
  'What is out of stock right now, and is it on order?',
  'Which suppliers are the riskiest, and why?',
  'Summarize the last 30 days of sales by category.',
  'What should I reorder at BLR this week?',
];

/** The conversation thread and composer, shared by the full page and the side panel. */
export function ChatView({
  conversationId,
  onConversation,
  initialQuestion,
  compact = false,
}: {
  conversationId: string | null;
  onConversation: (id: string) => void;
  /** Sent once on mount (from the command palette). */
  initialQuestion?: string;
  compact?: boolean;
}) {
  const conversation = useQuery({ ...conversationQuery(conversationId ?? ''), enabled: !!conversationId });
  const ai = useQuery(aiStatusQuery);
  const chat = useChat(conversationId, onConversation);
  const can = useCan();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const sentInitial = useRef<string | null>(null);

  useEffect(() => {
    if (initialQuestion && sentInitial.current !== initialQuestion && !chat.busy) {
      sentInitial.current = initialQuestion;
      chat.send(initialQuestion);
    }
  }, [initialQuestion, chat]);

  const messages = conversation.data?.messages ?? [];
  const live = chat.live;
  // Keep the newest content in view while the person hasn't scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, live?.text, live?.tools.length, live?.parts.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || chat.busy) return;
    chat.clearError();
    setDraft('');
    pinned.current = true;
    chat.send(text);
  };
  const ruleBased = ai.data?.mode === 'RULE_BASED';
  const empty = !messages.length && !live;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-4 py-4' : 'px-4 py-6 sm:px-6')}
        aria-live="polite"
      >
        {conversationId && conversation.isPending ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="ml-auto h-10 w-2/3" />
            <Skeleton className="h-28 w-5/6" />
          </div>
        ) : conversation.isError ? (
          <ErrorState compact error={conversation.error} onRetry={() => void conversation.refetch()} />
        ) : empty ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-8 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Sparkles className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight">Ask about your inventory</p>
              <p className="mt-1 text-sm text-fg-secondary">
                Answers come from live data through the same tools the agents use. Changes are drafted for you
                to confirm.
              </p>
            </div>
            {ruleBased && (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                No AI model is available.{' '}
                {can('agents.configure') ? (
                  <Link to="/settings/ai" className="font-medium underline">
                    Set one up
                  </Link>
                ) : (
                  'Ask an admin to set one up'
                )}{' '}
                to use the Assistant.
              </p>
            )}
            <div className="flex w-full flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    pinned.current = true;
                    chat.send(s);
                  }}
                  className="rounded-lg border border-hairline bg-surface px-3.5 py-2.5 text-left text-sm text-fg-secondary transition-colors hover:border-hairline-strong hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m) => (
              <li key={m.id}>{m.role === 'user' ? <Question text={m.content} /> : <Answer message={m} />}</li>
            ))}
            {live && (
              <li className="flex flex-col gap-6">
                <Question text={live.question} />
                <div className="flex flex-col gap-3">
                  <ToolTrail tools={live.tools} />
                  <PartsView parts={live.parts} messageId={null} />
                  {live.text ? (
                    <Markdown text={live.text} />
                  ) : (
                    !live.error && (
                      <p className="flex items-center gap-2 text-sm text-fg-tertiary">
                        <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
                        {live.tools.some((t) => t.status === 'running') ? 'Looking it up…' : 'Thinking…'}
                      </p>
                    )
                  )}
                  {live.error && (
                    <p className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} /> {live.error}
                    </p>
                  )}
                </div>
              </li>
            )}
          </ol>
        )}
      </div>

      <form
        className={cn('border-t border-hairline', compact ? 'p-3' : 'px-4 py-3 sm:px-6')}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-hairline-strong bg-surface p-1.5 focus-within:border-accent">
          <textarea
            aria-label="Ask the Assistant"
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(160, e.currentTarget.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about stock, sales, suppliers or orders…"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-fg-tertiary"
          />
          {chat.busy ? (
            <IconButton label="Stop" onClick={chat.stop} className="shrink-0">
              <Square strokeWidth={1.75} />
            </IconButton>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!draft.trim()}
              className="size-8 shrink-0 p-0"
              aria-label="Send"
            >
              <ArrowUp strokeWidth={2} />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-fg-tertiary">
          Enter to send · Shift+Enter for a new line · Nothing changes until you confirm a card.
        </p>
      </form>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm whitespace-pre-wrap text-fg">
      {text}
    </div>
  );
}

function Answer({ message: m }: { message: ChatMessageDto }) {
  const tools = m.parts.flatMap((p) =>
    p.kind === 'tool'
      ? [{ name: p.name, label: p.label, status: p.ok ? ('done' as const) : ('error' as const) }]
      : [],
  );
  return (
    <div className="flex flex-col gap-3">
      <ToolTrail tools={tools} />
      <PartsView parts={m.parts} messageId={m.id} />
      <Markdown text={m.content} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-tertiary">
        {m.ruleBased ? <AiMarker source="rule" /> : <AiMarker model={m.modelUsed} />}
        {m.citations.length > 0 && (
          <span>Data used: {[...new Set(m.citations.map((c) => c.label))].slice(0, 4).join(' · ')}</span>
        )}
        {m.runId && (
          <Link
            to="/agents/runs/$id"
            params={{ id: m.runId }}
            className="hover:text-fg-secondary hover:underline"
          >
            How I answered
          </Link>
        )}
      </div>
    </div>
  );
}

function ToolTrail({ tools }: { tools: LiveTool[] }) {
  if (!tools.length) return null;
  // Corrected calls (the model fixed its arguments) are one chip, not one per attempt.
  const retries = tools.filter((t) => t.status === 'error').length;
  const shown = tools.filter((t) => t.status !== 'error');
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tools used">
      {retries > 0 && (
        <li className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-fg-tertiary">
          <Wrench className="size-3.5" strokeWidth={1.75} aria-hidden />
          Corrected {retries} lookup{retries === 1 ? '' : 's'}
        </li>
      )}
      {shown.map((t, i) => (
        <li
          key={`${t.name}-${i}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
            t.status === 'error' ? 'border-warning/40 text-warning' : 'border-hairline text-fg-secondary',
          )}
        >
          {t.status === 'running' ? (
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : t.status === 'done' ? (
            <CircleCheck className="size-3.5 text-success" strokeWidth={1.75} aria-hidden />
          ) : (
            <Wrench className="size-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t.status === 'error' ? 'Retried a lookup' : t.label}
        </li>
      ))}
    </ul>
  );
}

function PartsView({ parts, messageId }: { parts: ChatPart[]; messageId: string | null }) {
  const visible = parts.filter((p) => p.kind !== 'tool');
  if (!visible.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {visible.map((p, i) =>
        p.kind === 'chart' ? (
          <ChatChartView key={i} chart={p.chart} />
        ) : p.kind === 'card' ? (
          messageId ? (
            <ConfirmationCardView key={p.card.id} card={p.card} messageId={messageId} />
          ) : (
            <div key={p.card.id} className="rounded-xl border border-hairline bg-surface-2 p-4 text-sm">
              <p className="font-semibold">{p.card.title}</p>
              <p className="text-xs text-fg-secondary">{p.card.summary}</p>
              <p className="mt-2 text-xs text-fg-tertiary">
                You can confirm this as soon as the answer finishes.
              </p>
            </div>
          )
        ) : null,
      )}
    </div>
  );
}
