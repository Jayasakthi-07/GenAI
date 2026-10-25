import type {
  CountApprove,
  CountLinesUpdate,
  CycleCountDetail,
  CycleCountInput,
  CycleCountListItem,
  TransferDetail,
  TransferInput,
  TransferListItem,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import type { Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

/* Transfers */
export const transfersQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.transfers.list(search),
    queryFn: ({ signal }) => api.get<Page<TransferListItem>>('/transfers', toApiQuery(search), signal),
  });
export const transferQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.transfers.detail(id),
    queryFn: ({ signal }) => api.get<TransferDetail>(`/transfers/${id}`, undefined, signal),
  });

export const useCreateTransfer = () =>
  useInvalidatingMutation((input: TransferInput) => api.post<TransferDetail>('/transfers', input));
export const useShipTransfer = () =>
  useInvalidatingMutation((id: string) => api.post<TransferDetail>(`/transfers/${id}/ship`));
export const useReceiveTransfer = () =>
  useInvalidatingMutation((id: string) => api.post<TransferDetail>(`/transfers/${id}/receive`));
export const useCancelTransfer = () =>
  useInvalidatingMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post<TransferDetail>(`/transfers/${id}/cancel`, { reason }),
  );

/* Cycle counts */
export const cycleCountsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.cycleCounts.list(search),
    queryFn: ({ signal }) => api.get<Page<CycleCountListItem>>('/cycle-counts', toApiQuery(search), signal),
  });
export const cycleCountQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.cycleCounts.detail(id),
    queryFn: ({ signal }) => api.get<CycleCountDetail>(`/cycle-counts/${id}`, undefined, signal),
  });

export const useCreateCount = () =>
  useInvalidatingMutation(
    (input: CycleCountInput) => api.post<CycleCountDetail>('/cycle-counts', input),
    [queryKeys.cycleCounts.all],
  );
export const useUpdateCountLines = (id: string) =>
  useInvalidatingMutation(
    (input: CountLinesUpdate) => api.patch<CycleCountDetail>(`/cycle-counts/${id}/lines`, input),
    [queryKeys.cycleCounts.all],
  );
export const useSubmitCount = () =>
  useInvalidatingMutation(
    (id: string) => api.post<CycleCountDetail>(`/cycle-counts/${id}/submit`),
    [queryKeys.cycleCounts.all],
  );
export const useApproveCount = () =>
  useInvalidatingMutation(({ id, ...body }: CountApprove & { id: string }) =>
    api.post<CycleCountDetail>(`/cycle-counts/${id}/approve`, body),
  );
export const useCancelCount = () =>
  useInvalidatingMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      api.post<CycleCountDetail>(`/cycle-counts/${id}/cancel`, { reason }),
    [queryKeys.cycleCounts.all],
  );
