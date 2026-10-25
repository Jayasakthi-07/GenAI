import type {
  OrganizationDto,
  OrganizationUpdate,
  UserCreate,
  UserListItem,
  UserUpdate,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/lib/mutations';

export const organizationQuery = queryOptions({
  queryKey: ['settings', 'organization'],
  queryFn: ({ signal }) => api.get<OrganizationDto>('/settings/organization', undefined, signal),
  staleTime: 5 * 60_000,
});
export const usersQuery = queryOptions({
  queryKey: ['settings', 'users'],
  queryFn: ({ signal }) => api.get<UserListItem[]>('/users', undefined, signal),
});

export const useSaveOrganization = () =>
  useInvalidatingMutation(
    (input: OrganizationUpdate) => api.patch<OrganizationDto>('/settings/organization', input),
    [['settings', 'organization'], ['me']],
  );
export const useCreateUser = () =>
  useInvalidatingMutation(
    (input: UserCreate) => api.post<UserListItem>('/users', input),
    [['settings', 'users']],
  );
export const useUpdateUser = () =>
  useInvalidatingMutation(
    ({ id, ...input }: UserUpdate & { id: string }) => api.patch<UserListItem>(`/users/${id}`, input),
    [['settings', 'users']],
  );
export const useResetPassword = () =>
  useInvalidatingMutation(
    ({ id, password }: { id: string; password: string }) =>
      api.post<{ ok: true }>(`/users/${id}/reset-password`, { password }),
    [],
  );
