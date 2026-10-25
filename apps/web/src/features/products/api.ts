import type {
  AuditEntry,
  ImportPreview,
  ImportResult,
  Movement,
  ProductBulk,
  ProductDetail,
  ProductInput,
  ProductListItem,
  ProductStock,
  RiskLevel,
} from '@stockroom/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

export const productsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.products.list(search),
    queryFn: ({ signal }) => api.get<Page<ProductListItem>>('/products', toApiQuery(search), signal),
  });

export const productQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.products.detail(id),
    queryFn: ({ signal }) => api.get<ProductDetail>(`/products/${id}`, undefined, signal),
  });

export const productMovementsQuery = (id: string, filters: { warehouseId?: string; type?: string[] }) =>
  infiniteQueryOptions({
    queryKey: queryKeys.products.movements(id, filters),
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<Movement>>(
        `/products/${id}/movements`,
        toApiQuery({ ...filters, cursor: pageParam, limit: 50 }),
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const productSalesQuery = (id: string, days: number) =>
  queryOptions({
    queryKey: queryKeys.products.sales(id, days),
    queryFn: ({ signal }) =>
      api.get<Array<{ date: string; quantity: number; revenue: number }>>(
        `/products/${id}/sales`,
        { days },
        signal,
      ),
    staleTime: 5 * 60_000,
  });

export interface ProductSupplier {
  id: string;
  supplier: { id: string; name: string; code: string };
  supplierScore: number | null;
  riskLevel: RiskLevel | null;
  supplierActive: boolean;
  supplierSku: string | null;
  unitCost: string;
  moq: number;
  packSize: number;
  leadTimeDays: number;
  isActive: boolean;
  isPreferred: boolean;
  lastPurchaseCost: string | null;
  lastPurchasedAt: string | null;
}

export const productSuppliersQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.products.suppliers(id),
    queryFn: ({ signal }) => api.get<ProductSupplier[]>(`/products/${id}/suppliers`, undefined, signal),
  });

export const productActivityQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.products.activity(id),
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<AuditEntry>>(`/products/${id}/activity`, { cursor: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

const productKeys = [
  queryKeys.products.all,
  queryKeys.stock.all,
  queryKeys.dashboard.all,
  queryKeys.audit.all,
] as const;

export const useCreateProduct = () =>
  useInvalidatingMutation((input: ProductInput) => api.post<ProductDetail>('/products', input), productKeys);
export const useUpdateProduct = (id: string) =>
  useInvalidatingMutation(
    (input: ProductInput) => api.patch<ProductDetail>(`/products/${id}`, input),
    productKeys,
  );
export const useBulkProducts = () =>
  useInvalidatingMutation(
    (input: ProductBulk) => api.post<{ updated: number }>('/products/bulk', input),
    productKeys,
  );
export const useSetProductImage = (id: string) =>
  useInvalidatingMutation(
    (dataUrl: string) => api.put<ProductDetail>(`/products/${id}/image`, { dataUrl }),
    productKeys,
  );
export const useRemoveProductImage = (id: string) =>
  useInvalidatingMutation(() => api.delete<ProductDetail>(`/products/${id}/image`), productKeys);
export const useUpdateStockParams = (id: string) =>
  useInvalidatingMutation(
    ({
      warehouseId,
      ...body
    }: {
      warehouseId: string;
      reorderPoint: number | null;
      safetyStock: number | null;
      maxStock: number | null;
    }) => api.patch<ProductStock[]>(`/products/${id}/stock/${warehouseId}`, body),
  );
export const usePreviewImport = () =>
  useInvalidatingMutation(
    (body: { csv: string; updateExisting: boolean }) =>
      api.post<ImportPreview>('/products/import/preview', body),
    [],
  );
export const useCommitImport = () =>
  useInvalidatingMutation(
    (body: { csv: string; updateExisting: boolean }) =>
      api.post<ImportResult>('/products/import/commit', body),
    [...productKeys, queryKeys.catalog.all],
  );
