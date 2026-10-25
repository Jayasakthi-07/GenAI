import type {
  AiStatus,
  ConnectionTest,
  LatencyTest,
  ModelList,
  ModelRefDto,
  OllamaStatus,
  ProviderCreate,
  ProviderDto,
  ProviderUpdate,
  RoutingDto,
  UsageDto,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/lib/mutations';

export const aiKeys = {
  all: ['ai'] as const,
  status: ['ai', 'status'] as const,
  providers: ['ai', 'providers'] as const,
  ollama: ['ai', 'ollama'] as const,
  models: (q: object) => ['ai', 'models', q] as const,
  routing: ['ai', 'routing'] as const,
  usage: (days: number) => ['ai', 'usage', days] as const,
};

export const aiStatusQuery = queryOptions({
  queryKey: aiKeys.status,
  queryFn: ({ signal }) => api.get<AiStatus>('/ai/status', undefined, signal),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
export const providersQuery = queryOptions({
  queryKey: aiKeys.providers,
  queryFn: ({ signal }) => api.get<ProviderDto[]>('/ai/providers', undefined, signal),
});
/** Polled every 10 s while the AI settings page is open, so newly pulled models appear. */
export const ollamaQuery = queryOptions({
  queryKey: aiKeys.ollama,
  queryFn: ({ signal }) => api.get<OllamaStatus>('/ai/ollama', undefined, signal),
  refetchInterval: 10_000,
  refetchIntervalInBackground: false,
});
export const modelsQuery = (q: {
  q?: string;
  provider?: string;
  local?: boolean;
  free?: boolean;
  tools?: boolean;
}) =>
  queryOptions({
    queryKey: aiKeys.models(q),
    queryFn: ({ signal }) => api.get<ModelList>('/ai/models', q, signal),
    staleTime: 30_000,
  });
export const routingQuery = queryOptions({
  queryKey: aiKeys.routing,
  queryFn: ({ signal }) => api.get<RoutingDto>('/ai/routing', undefined, signal),
});
export const usageQuery = (days: number) =>
  queryOptions({
    queryKey: aiKeys.usage(days),
    queryFn: ({ signal }) => api.get<UsageDto>('/ai/usage', { days }, signal),
    refetchInterval: 30_000,
  });

const keys = [aiKeys.all] as const;
export const useUpdateProvider = () =>
  useInvalidatingMutation(
    ({ key, ...input }: ProviderUpdate & { key: string }) =>
      api.patch<ProviderDto>(`/ai/providers/${key}`, input),
    keys,
  );
export const useCreateProvider = () =>
  useInvalidatingMutation((input: ProviderCreate) => api.post<ProviderDto>('/ai/providers', input), keys);
export const useDeleteProvider = () =>
  useInvalidatingMutation((key: string) => api.delete<{ ok: true }>(`/ai/providers/${key}`), keys);
export const useTestProvider = () =>
  useInvalidatingMutation((key: string) => api.post<ConnectionTest>(`/ai/providers/${key}/test`), keys);
export const useProbeModel = () =>
  useInvalidatingMutation(
    (ref: ModelRefDto) =>
      api.post<{ tools: boolean; latencyMs: number; message: string }>('/ai/models/probe', ref),
    keys,
  );
export const useLatencyTest = () =>
  useInvalidatingMutation(
    (ref: ModelRefDto) => api.post<LatencyTest>('/ai/models/latency-test', ref),
    [aiKeys.usage(14)],
  );
export const useSaveRouting = () =>
  useInvalidatingMutation((input: RoutingDto) => api.put<RoutingDto>('/ai/routing', input), keys);
