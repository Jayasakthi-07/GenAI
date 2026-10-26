import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { Maximize2, Plus, Sparkles } from 'lucide-react';
import { conversationsQuery } from '@/features/assistant/api';
import { ChatView } from '@/features/assistant/chat-view';
import { assistantPanel, useAssistantPanel } from '@/features/assistant/panel-store';
import { Button, IconButton } from '../ui/button';
import { Tooltip } from '../ui/menus';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';

/** The Assistant beside any page. Opens on the latest conversation unless asked something new. */
export function AssistantPanel() {
  const panel = useAssistantPanel();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const list = useQuery({ ...conversationsQuery, enabled: panel.open });
  // First open: continue the most recent conversation.
  const conversationId =
    panel.conversationId ?? (panel.viewKey === 0 && !panel.question ? (list.data?.[0]?.id ?? null) : null);
  const waitingForList = panel.viewKey === 0 && !panel.conversationId && !panel.question && list.isPending;
  // The full page shows the same thread; no need for both.
  const open = panel.open && pathname !== '/assistant';
  return (
    <Sheet open={open} onOpenChange={(o) => !o && assistantPanel.close()}>
      <SheetContent
        className="flex w-full flex-col p-0 sm:max-w-xl"
        aria-describedby="assistant-panel-description"
        // Start in the composer, not on the first header button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const panel = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
          requestAnimationFrame(() => panel?.querySelector('textarea')?.focus());
        }}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline pr-12 pl-4">
          <Sparkles className="size-4 text-accent-text" strokeWidth={1.75} aria-hidden />
          <SheetTitle className="text-base">Assistant</SheetTitle>
          <SheetDescription id="assistant-panel-description" className="sr-only">
            Ask questions about your inventory; changes are drafted for you to confirm.
          </SheetDescription>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip content="New conversation">
              <IconButton label="New conversation" onClick={() => assistantPanel.newConversation()}>
                <Plus strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <Tooltip content="Open full page">
              <Button variant="ghost" size="sm" className="size-8 p-0" asChild>
                <Link
                  to="/assistant"
                  search={conversationId ? { c: conversationId } : {}}
                  onClick={() => assistantPanel.close()}
                  aria-label="Open the Assistant page"
                >
                  <Maximize2 strokeWidth={1.75} />
                </Link>
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {open && !waitingForList && (
            <ChatView
              key={`${panel.viewKey}:${panel.viewKey === 0 ? (list.data?.[0]?.id ?? 'new') : ''}`}
              compact
              conversationId={conversationId}
              onConversation={(id) => assistantPanel.adopt(id)}
              initialQuestion={panel.question ?? undefined}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
