import type {
  ActionApprove,
  ActionCounts,
  ActionDto,
  AgentDto,
  AgentGraph,
  AgentKey,
  AgentRunDetail,
  AgentRunDto,
  AgentUpdate,
  ModelRefDto,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import type { Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { INVENTORY_ROOTS, queryKeys } from '@/lib/query-keys';

export const agentsQuery = queryOptions({
  queryKey: queryKeys.agents.list,
  queryFn: ({ signal }) => api.get<AgentDto[]>('/agents', undefined, signal),
});
export const agentQuery = (key: AgentKey) =>
  queryOptions({
    queryKey: queryKeys.agents.detail(key),
    queryFn: ({ signal }) => api.get<AgentDto>(`/agents/${key}`, undefined, signal),
  });
export const agentGraphQuery = queryOptions({
  queryKey: queryKeys.agents.graph,
  queryFn: ({ signal }) => api.get<AgentGraph>('/agents/graph', undefined, signal),
});

export const runsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.runs.list(search),
    queryFn: ({ signal }) => api.get<Page<AgentRunDto>>('/agent-runs', toApiQuery(search), signal),
  });
/** Runs waiting or in progress; seeds the live indicator, then SSE keeps it current. */
export const activeRunsQuery = queryOptions({
  queryKey: queryKeys.runs.active,
  queryFn: ({ signal }) =>
    api.get<Page<AgentRunDto>>('/agent-runs', { status: 'QUEUED,RUNNING', pageSize: 20 }, signal),
  refetchInterval: 60_000,
});
export const runQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.runs.detail(id),
    queryFn: ({ signal }) => api.get<AgentRunDetail>(`/agent-runs/${id}`, undefined, signal),
  });

export const actionsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.actions.list(search),
    queryFn: ({ signal }) => api.get<Page<ActionDto>>('/actions', toApiQuery(search), signal),
  });
export const actionQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.actions.detail(id),
    queryFn: ({ signal }) => api.get<ActionDto>(`/actions/${id}`, undefined, signal),
  });
export const actionCountsQuery = queryOptions({
  queryKey: queryKeys.actions.counts,
  queryFn: ({ signal }) => api.get<ActionCounts>('/actions/counts', undefined, signal),
  refetchInterval: 60_000,
});

const agentRoots = [queryKeys.agents.all, queryKeys.runs.all] as const;
export const useUpdateAgent = (key: AgentKey) =>
  useInvalidatingMutation(
    (input: AgentUpdate) => api.patch<AgentDto>(`/agents/${key}`, input),
    [...agentRoots, queryKeys.audit.all],
  );
export const useRunAgent = () =>
  useInvalidatingMutation(
    ({ key, ...body }: { key: AgentKey; model?: ModelRefDto; note?: string }) =>
      api.post<{ runId: string; deduped: boolean }>(`/agents/${key}/run`, body),
    agentRoots,
  );
export const useCancelRun = () =>
  useInvalidatingMutation(
    (id: string) => api.post<{ cancelled: boolean }>(`/agent-runs/${id}/cancel`),
    agentRoots,
  );

/** Executing a proposal creates POs, transfers, counts or setting changes, so refresh broadly. */
const decisionRoots = [queryKeys.actions.all, ...agentRoots, ...INVENTORY_ROOTS] as const;
export const useApproveAction = () =>
  useInvalidatingMutation(
    ({ id, ...body }: ActionApprove & { id: string }) => api.post<ActionDto>(`/actions/${id}/approve`, body),
    decisionRoots,
  );
export const useRejectAction = () =>
  useInvalidatingMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      api.post<ActionDto>(`/actions/${id}/reject`, { reason }),
    decisionRoots,
  );
