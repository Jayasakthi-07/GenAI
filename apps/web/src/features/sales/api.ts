import type { Customer, CustomerInput, SoDetail, SoFulfill, SoInput, SoListItem } from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import type { Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export const customersQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.customers.list(search),
    queryFn: ({ signal }) => api.get<Page<Customer>>('/customers', toApiQuery(search), signal),
  });
export const allCustomersQuery = queryOptions({
  queryKey: queryKeys.customers.list({ all: true }),
  queryFn: ({ signal }) => api.get<Page<Customer>>('/customers', { pageSize: 200, sort: 'name:asc' }, signal),
  staleTime: 5 * 60_000,
});
export const useSaveCustomer = () =>
  useInvalidatingMutation(
    ({ id, ...input }: CustomerInput & { id?: string }) =>
      id ? api.patch<Customer>(`/customers/${id}`, input) : api.post<Customer>('/customers', input),
    [queryKeys.customers.all, queryKeys.salesOrders.all],
  );

export const salesOrdersQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.salesOrders.list(search),
    queryFn: ({ signal }) => api.get<Page<SoListItem>>('/sales-orders', toApiQuery(search), signal),
  });
export const salesOrderQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.salesOrders.detail(id),
    queryFn: ({ signal }) => api.get<SoDetail>(`/sales-orders/${id}`, undefined, signal),
  });

export const useCreateSo = () =>
  useInvalidatingMutation((input: SoInput) => api.post<SoDetail>('/sales-orders', input));
export const useUpdateSo = (id: string) =>
  useInvalidatingMutation((input: SoInput) => api.patch<SoDetail>(`/sales-orders/${id}`, input));
export const useConfirmSo = () =>
  useInvalidatingMutation((id: string) => api.post<SoDetail>(`/sales-orders/${id}/confirm`));
export const useFulfillSo = () =>
  useInvalidatingMutation(({ id, ...body }: SoFulfill & { id: string }) =>
    api.post<SoDetail>(`/sales-orders/${id}/fulfill`, body),
  );
export const useCancelSo = () =>
  useInvalidatingMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post<SoDetail>(`/sales-orders/${id}/cancel`, { reason }),
  );
