import type {
  AdjustInput,
  Batch,
  FefoResult,
  IssueInput,
  Movement,
  ReceiveInput,
  StockOperationResult,
  StockPosition,
  StockSummary,
  WriteOffInput,
} from '@stockroom/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { CursorPage, Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export const positionsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.stock.positions(search),
    queryFn: ({ signal }) => api.get<Page<StockPosition>>('/stock/positions', toApiQuery(search), signal),
  });

export const stockSummaryQuery = (warehouseId?: string) =>
  queryOptions({
    queryKey: queryKeys.stock.summary(warehouseId),
    queryFn: ({ signal }) => api.get<StockSummary>('/stock/summary', { warehouseId }, signal),
  });

export const movementsQuery = (search: Record<string, unknown>) =>
  infiniteQueryOptions({
    queryKey: queryKeys.stock.movements(search),
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<Movement>>(
        '/stock/movements',
        toApiQuery({ ...search, cursor: pageParam, limit: 50 }),
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const batchesQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.stock.batches(search),
    queryFn: ({ signal }) => api.get<Page<Batch>>('/stock/batches', toApiQuery(search), signal),
  });

export const fefoQuery = (productId: string, warehouseId: string, quantity: number) =>
  queryOptions({
    queryKey: queryKeys.stock.fefo(productId, warehouseId, quantity),
    queryFn: ({ signal }) => api.get<FefoResult>('/stock/fefo', { productId, warehouseId, quantity }, signal),
    staleTime: 10_000,
  });

export const useReceiveStock = () =>
  useInvalidatingMutation((input: ReceiveInput) => api.post<StockOperationResult>('/stock/receive', input));
export const useIssueStock = () =>
  useInvalidatingMutation((input: IssueInput) => api.post<StockOperationResult>('/stock/issue', input));
export const useAdjustStock = () =>
  useInvalidatingMutation((input: AdjustInput) => api.post<StockOperationResult>('/stock/adjust', input));
export const useWriteOffStock = () =>
  useInvalidatingMutation((input: WriteOffInput) =>
    api.post<StockOperationResult>('/stock/write-off', input),
  );
