import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/feedback/states';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { conversationsQuery, useDeleteConversation } from '@/features/assistant/api';
import { ChatView } from '@/features/assistant/chat-view';
import { ago } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cleanSearch, idParam } from '@/lib/list-search';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/assistant')({
  validateSearch: z.object({ c: idParam, q: z.string().max(500).optional().catch(undefined) }),
  staticData: { title: 'Assistant' },
  component: AssistantPage,
});

function AssistantPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useQuery(conversationsQuery);
  const remove = useDeleteConversation();
  const [deleting, setDeleting] = useState<string | null>(null);
  // Remount the thread only on deliberate switches, not when a new chat receives its id.
  const [viewKey, setViewKey] = useState(0);
  const select = (c: string | undefined) => {
    setViewKey((k) => k + 1);
    void navigate({ search: (p) => cleanSearch({ ...p, c, q: undefined }) });
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside
        className="hidden w-72 shrink-0 flex-col border-r border-hairline md:flex"
        aria-label="Conversations"
      >
        <div className="p-3">
          <Button variant="secondary" className="w-full" onClick={() => select(undefined)}>
            <Plus strokeWidth={1.75} /> New conversation
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {list.isPending ? (
            <div className="flex flex-col gap-2 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.isError ? (
            <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
          ) : list.data.length === 0 ? (
            <p className="flex items-center gap-2 px-2 py-3 text-sm text-fg-tertiary">
              <MessagesSquare className="size-4" strokeWidth={1.75} /> Your conversations appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {list.data.map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={c.id === search.c ? 'true' : undefined}
                    className={cn(
                      'flex w-full flex-col rounded-md px-3 py-2 pr-9 text-left transition-colors',
                      c.id === search.c ? 'bg-accent-soft text-accent-text' : 'hover:bg-neutral-soft',
                    )}
                  >
                    <span className="truncate text-sm font-medium">{c.title}</span>
                    <span className="text-xs text-fg-tertiary">{ago(c.updatedAt)}</span>
                  </button>
                  <IconButton
                    label={`Delete “${c.title}”`}
                    size="sm"
                    className="absolute top-2 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => setDeleting(c.id)}
                  >
                    <Trash2 strokeWidth={1.75} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        {/* Phones: the conversation list becomes a picker. */}
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 md:hidden">
          <Select
            aria-label="Conversation"
            value={search.c ?? 'new'}
            onValueChange={(v) => select(v === 'new' ? undefined : v)}
            options={[
              { value: 'new', label: 'New conversation' },
              ...(list.data ?? []).map((c) => ({ value: c.id, label: c.title })),
            ]}
            className="min-w-0 flex-1"
          />
          <IconButton label="New conversation" onClick={() => select(undefined)}>
            <Plus strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1">
          <ChatView
            key={viewKey}
            conversationId={search.c ?? null}
            onConversation={(id) =>
              void navigate({ search: (p) => cleanSearch({ ...p, c: id, q: undefined }), replace: true })
            }
            initialQuestion={search.q}
          />
        </div>
      </section>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this conversation?"
        description="The messages are removed. Anything you confirmed stays done and is kept in the audit log."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting, {
            onSuccess: () => {
              toast.success('Conversation deleted');
              if (deleting === search.c) select(undefined);
              setDeleting(null);
            },
            onError: (e) => reportError(e, undefined, 'Couldn’t delete'),
          })
        }
      />
    </div>
  );
}
