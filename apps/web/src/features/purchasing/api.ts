import type {
  PoDetail,
  PoInput,
  PoListItem,
  PoReceive,
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierProduct,
  SupplierProductInput,
  SupplierScorecard,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import type { Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

/* Suppliers */
export const suppliersQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.suppliers.list(search),
    queryFn: ({ signal }) => api.get<Page<SupplierListItem>>('/suppliers', toApiQuery(search), signal),
  });
/** Every supplier, for pickers (there are tens, not thousands). */
export const allSuppliersQuery = queryOptions({
  queryKey: queryKeys.suppliers.list({ all: true }),
  queryFn: ({ signal }) =>
    api.get<Page<SupplierListItem>>('/suppliers', { pageSize: 200, sort: 'name:asc' }, signal),
  staleTime: 5 * 60_000,
});
export const supplierQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.suppliers.detail(id),
    queryFn: ({ signal }) => api.get<SupplierDetail>(`/suppliers/${id}`, undefined, signal),
  });
export const supplierCatalogQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.suppliers.catalog(id),
    queryFn: ({ signal }) => api.get<SupplierProduct[]>(`/suppliers/${id}/catalog`, undefined, signal),
  });
export const supplierScorecardQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.suppliers.scorecard(id),
    queryFn: ({ signal }) => api.get<SupplierScorecard>(`/suppliers/${id}/scorecard`, undefined, signal),
  });

const supplierKeys = [queryKeys.suppliers.all, queryKeys.products.all, queryKeys.audit.all] as const;
export const useSaveSupplier = () =>
  useInvalidatingMutation(
    ({ id, ...input }: SupplierInput & { id?: string }) =>
      id
        ? api.patch<SupplierDetail>(`/suppliers/${id}`, input)
        : api.post<SupplierDetail>('/suppliers', input),
    supplierKeys,
  );
export const useSaveCatalogItem = (supplierId: string) =>
  useInvalidatingMutation(
    ({ linkId, ...input }: SupplierProductInput & { linkId?: string }) =>
      linkId
        ? api.patch<SupplierProduct[]>(`/suppliers/${supplierId}/catalog/${linkId}`, input)
        : api.post<SupplierProduct[]>(`/suppliers/${supplierId}/catalog`, input),
    supplierKeys,
  );
export const useRemoveCatalogItem = (supplierId: string) =>
  useInvalidatingMutation(
    (linkId: string) => api.delete<SupplierProduct[]>(`/suppliers/${supplierId}/catalog/${linkId}`),
    supplierKeys,
  );

/* Purchase orders */
export const purchaseOrdersQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.purchaseOrders.list(search),
    queryFn: ({ signal }) => api.get<Page<PoListItem>>('/purchase-orders', toApiQuery(search), signal),
  });
export const purchaseOrderQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.purchaseOrders.detail(id),
    queryFn: ({ signal }) => api.get<PoDetail>(`/purchase-orders/${id}`, undefined, signal),
  });

export const useCreatePo = () =>
  useInvalidatingMutation((input: PoInput) => api.post<PoDetail>('/purchase-orders', input));
export const useUpdatePo = (id: string) =>
  useInvalidatingMutation((input: PoInput) => api.patch<PoDetail>(`/purchase-orders/${id}`, input));
export type PoTransition = 'submit' | 'approve' | 'send';
export const usePoTransition = () =>
  useInvalidatingMutation(({ id, action }: { id: string; action: PoTransition }) =>
    api.post<PoDetail>(`/purchase-orders/${id}/${action}`),
  );
export const usePoWithReason = () =>
  useInvalidatingMutation(
    ({ id, action, reason }: { id: string; action: 'reject' | 'cancel' | 'close'; reason: string }) =>
      api.post<PoDetail>(`/purchase-orders/${id}/${action}`, { reason: reason || null }),
  );
export const useReceivePo = (id: string) =>
  useInvalidatingMutation((input: PoReceive) => api.post<PoDetail>(`/purchase-orders/${id}/receipts`, input));
