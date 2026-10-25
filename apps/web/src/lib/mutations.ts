import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { INVENTORY_ROOTS } from './query-keys';

/**
 * A mutation that refreshes related data afterwards. Stock-changing operations default to every
 * inventory-related root, because one receipt moves positions, product pages, alerts and the dashboard.
 */
export function useInvalidatingMutation<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  keys: ReadonlyArray<QueryKey> = INVENTORY_ROOTS,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => undefined),
  });
}
