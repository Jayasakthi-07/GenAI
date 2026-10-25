import type {
  Category,
  CategoryInput,
  ReasonCode,
  ReasonCodeInput,
  SavedView,
  SavedViewInput,
  Unit,
  UnitInput,
  Warehouse,
  WarehouseInput,
} from '@stockroom/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const warehousesQuery = queryOptions({
  queryKey: queryKeys.catalog.warehouses,
  queryFn: () => api.get<Warehouse[]>('/warehouses'),
  staleTime: 5 * 60_000,
});
export const categoriesQuery = queryOptions({
  queryKey: queryKeys.catalog.categories,
  queryFn: () => api.get<Category[]>('/categories'),
  staleTime: 5 * 60_000,
});
export const unitsQuery = queryOptions({
  queryKey: queryKeys.catalog.units,
  queryFn: () => api.get<Unit[]>('/units'),
  staleTime: 5 * 60_000,
});
export const reasonCodesQuery = queryOptions({
  queryKey: queryKeys.catalog.reasonCodes,
  queryFn: () => api.get<ReasonCode[]>('/reason-codes'),
  staleTime: 5 * 60_000,
});

export const useWarehouses = () => useQuery(warehousesQuery);
export const useCategories = () => useQuery(categoriesQuery);
export const useUnits = () => useQuery(unitsQuery);
export const useReasonCodes = () => useQuery(reasonCodesQuery);

export interface CategoryNode extends Category {
  depth: number;
  /** "Staples › Rice" */
  path: string;
  children: CategoryNode[];
}

/** Builds the category tree plus a flat, depth-first list for pickers. */
export function useCategoryTree() {
  const query = useCategories();
  const tree = useMemo(() => {
    const byId = new Map<string, CategoryNode>();
    for (const c of query.data ?? []) byId.set(c.id, { ...c, depth: 0, path: c.name, children: [] });
    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const flat: CategoryNode[] = [];
    const walk = (nodes: CategoryNode[], depth: number, prefix: string) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      for (const n of nodes) {
        n.depth = depth;
        n.path = prefix ? `${prefix} › ${n.name}` : n.name;
        flat.push(n);
        walk(n.children, depth + 1, n.path);
      }
    };
    walk(roots, 0, '');
    return { roots, flat, byId };
  }, [query.data]);
  return { ...query, ...tree };
}

function useCatalogMutation<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  keys: ReadonlyArray<readonly unknown[]>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useSaveWarehouse = () =>
  useCatalogMutation(
    ({ id, ...input }: WarehouseInput & { id?: string }) =>
      id ? api.patch<Warehouse>(`/warehouses/${id}`, input) : api.post<Warehouse>('/warehouses', input),
    [queryKeys.catalog.warehouses, queryKeys.dashboard.all],
  );

export const useSaveCategory = () =>
  useCatalogMutation(
    ({ id, ...input }: CategoryInput & { id?: string }) =>
      id ? api.patch<Category>(`/categories/${id}`, input) : api.post<Category>('/categories', input),
    [queryKeys.catalog.categories, queryKeys.products.all],
  );
export const useDeleteCategory = () =>
  useCatalogMutation(
    (id: string) => api.delete<{ ok: true }>(`/categories/${id}`),
    [queryKeys.catalog.categories],
  );

export const useSaveUnit = () =>
  useCatalogMutation(
    ({ id, ...input }: UnitInput & { id?: string }) =>
      id ? api.patch<Unit>(`/units/${id}`, input) : api.post<Unit>('/units', input),
    [queryKeys.catalog.units],
  );
export const useDeleteUnit = () =>
  useCatalogMutation((id: string) => api.delete<{ ok: true }>(`/units/${id}`), [queryKeys.catalog.units]);

export const useSaveReasonCode = () =>
  useCatalogMutation(
    ({ id, ...input }: ReasonCodeInput & { id?: string }) =>
      id ? api.patch<ReasonCode>(`/reason-codes/${id}`, input) : api.post<ReasonCode>('/reason-codes', input),
    [queryKeys.catalog.reasonCodes],
  );

/* Saved views */
export const savedViewsQuery = (page: string) =>
  queryOptions({
    queryKey: queryKeys.catalog.savedViews(page),
    queryFn: () => api.get<SavedView[]>('/saved-views', { page }),
    staleTime: 5 * 60_000,
  });
export const useSaveView = (page: string) =>
  useCatalogMutation(
    ({ id, ...input }: SavedViewInput & { id?: string }) =>
      id ? api.patch<SavedView>(`/saved-views/${id}`, input) : api.post<SavedView>('/saved-views', input),
    [queryKeys.catalog.savedViews(page)],
  );
export const useDeleteView = (page: string) =>
  useCatalogMutation(
    (id: string) => api.delete<{ ok: true }>(`/saved-views/${id}`),
    [queryKeys.catalog.savedViews(page)],
  );
