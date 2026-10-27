import {
  type ChangePasswordRequest,
  type LoginRequest,
  type MeResponse,
  type Permission,
  type SessionUser,
  type SystemInfo,
  type UserPreferences,
} from '@stockroom/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys } from './query-keys';

/** The signed-in session, or null. Uses /auth/session so a signed-out visit doesn't log a 401. */
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me,
  queryFn: () => api.get<MeResponse | null>('/auth/session'),
  staleTime: 5 * 60_000,
  retry: false,
});

export const systemInfoQueryOptions = queryOptions({
  queryKey: queryKeys.systemInfo,
  queryFn: () => api.get<SystemInfo>('/system/info'),
  staleTime: 60_000,
});

export function useMe(): MeResponse {
  const { data } = useQuery(meQueryOptions);
  if (!data) throw new Error('useMe() used outside an authenticated route');
  return data;
}

/** Permission check for hiding/disabling UI. The server enforces the same rules. */
export function useCan(): (permission: Permission) => boolean {
  const { data } = useQuery(meQueryOptions);
  return (permission) => data?.permissions.includes(permission) ?? false;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api.post<{ user: SessionUser }>('/auth/login', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      await qc.fetchQuery(meQueryOptions);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    onSettled: () => qc.clear(),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api.post<{ ok: true }>('/auth/change-password', body),
    // A temporary password is replaced, so the first-sign-in prompt closes.
    onSuccess: () =>
      qc.setQueryData<MeResponse>(queryKeys.me, (me) =>
        me ? { ...me, user: { ...me.user, mustChangePassword: false } } : me,
      ),
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) => api.patch<UserPreferences>('/me/preferences', patch),
    onSuccess: (preferences) => {
      qc.setQueryData<MeResponse>(queryKeys.me, (me) =>
        me ? { ...me, user: { ...me.user, preferences } } : me,
      );
    },
  });
}
