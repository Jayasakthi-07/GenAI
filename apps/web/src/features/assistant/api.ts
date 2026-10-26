import {
  API_PREFIX,
  type ActionDto,
  type ChatMessageDto,
  type ChatStreamEvent,
  type ConversationDetail,
  type ConversationDto,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useInvalidatingMutation } from '@/lib/mutations';
import { INVENTORY_ROOTS, queryKeys } from '@/lib/query-keys';

export const chatKeys = {
  all: ['assistant'] as const,
  list: ['assistant', 'conversations'] as const,
  detail: (id: string) => ['assistant', 'conversation', id] as const,
};

export const conversationsQuery = queryOptions({
  queryKey: chatKeys.list,
  queryFn: ({ signal }) => api.get<ConversationDto[]>('/assistant/conversations', undefined, signal),
});
export const conversationQuery = (id: string) =>
  queryOptions({
    queryKey: chatKeys.detail(id),
    queryFn: ({ signal }) => api.get<ConversationDetail>(`/assistant/conversations/${id}`, undefined, signal),
  });

export const createConversation = () => api.post<ConversationDto>('/assistant/conversations');
export const useRenameConversation = () =>
  useInvalidatingMutation(
    ({ id, title }: { id: string; title: string }) =>
      api.patch<ConversationDto>(`/assistant/conversations/${id}`, { title }),
    [chatKeys.all],
  );
export const useDeleteConversation = () =>
  useInvalidatingMutation(
    (id: string) => api.delete<void>(`/assistant/conversations/${id}`),
    [chatKeys.list],
  );

/** Confirming a card changes real data (a PO, a transfer, a price), so refresh broadly. */
export const useConfirmCard = () =>
  useInvalidatingMutation(
    ({ messageId, cardId }: { messageId: string; cardId: string }) =>
      api.post<{ message: ChatMessageDto; action: ActionDto | null }>(
        `/assistant/messages/${messageId}/cards/${cardId}/confirm`,
      ),
    [chatKeys.all, queryKeys.actions.all, queryKeys.agents.all, ...INVENTORY_ROOTS],
  );
export const useDismissCard = () =>
  useInvalidatingMutation(
    ({ messageId, cardId }: { messageId: string; cardId: string }) =>
      api.post<ChatMessageDto>(`/assistant/messages/${messageId}/cards/${cardId}/dismiss`),
    [chatKeys.all],
  );

/** Sends a question and calls `onEvent` for each line of the streamed (NDJSON) reply. */
export async function streamMessage(
  conversationId: string,
  content: string,
  onEvent: (e: ChatStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}/assistant/conversations/${conversationId}/messages`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the Stockroom server. Is it running?');
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(res.status, 'INTERNAL', body?.error?.message ?? 'The Assistant couldn’t answer.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onEvent(JSON.parse(line) as ChatStreamEvent);
        nl = buffer.indexOf('\n');
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
  }
}
