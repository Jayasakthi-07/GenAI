import type {
  DemoResetResult,
  SettingsBackup,
  SettingsImport,
  SettingsImportResult,
  SimulationScenario,
  SimulationState,
} from '@stockroom/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const simulationQuery = queryOptions({
  queryKey: queryKeys.simulation,
  queryFn: ({ signal }) => api.get<SimulationState>('/simulation', undefined, signal),
  // Live: every tick sends a simulation.state event that replaces this.
  staleTime: Infinity,
});

/** Simulator controls answer with the new state, which goes straight into the cache. */
function useSimulationMutation<TInput>(fn: (input: TInput) => Promise<SimulationState>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => qc.setQueryData(queryKeys.simulation, state),
  });
}

export const useStartSimulation = () =>
  useSimulationMutation(() => api.post<SimulationState>('/simulation/start'));
export const useStopSimulation = () =>
  useSimulationMutation(() => api.post<SimulationState>('/simulation/stop'));
export const useSimulationSpeed = () =>
  useSimulationMutation((speed: number) => api.patch<SimulationState>('/simulation', { speed }));
export const useRunScenario = () =>
  useSimulationMutation((key: SimulationScenario) =>
    api.post<SimulationState>(`/simulation/scenarios/${key}`),
  );

/** Everything changes after a reset, so every query is refetched. */
export const useResetDemo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DemoResetResult>('/demo/reset'),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const exportSettings = () => api.get<SettingsBackup>('/settings/backup');
export const useImportSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsImport) => api.post<SettingsImportResult>('/settings/backup/import', input),
    onSuccess: (r) => {
      if (r.applied) void qc.invalidateQueries();
    },
  });
};
