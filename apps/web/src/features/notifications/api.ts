import type { MarkRead, NotificationList } from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export const notificationsQuery = queryOptions({
  queryKey: queryKeys.notifications.list,
  queryFn: ({ signal }) => api.get<NotificationList>('/notifications', { limit: 30 }, signal),
  // Live events refresh it; this is the fallback while the stream is reconnecting.
  refetchInterval: 120_000,
});

export const useMarkNotificationsRead = () =>
  useInvalidatingMutation(
    (input: MarkRead) => api.post<{ updated: number; unread: number }>('/notifications/read', input),
    [queryKeys.notifications.all],
  );
