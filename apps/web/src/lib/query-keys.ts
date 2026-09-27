/** Every TanStack Query key in one place, so realtime events can invalidate precisely. */
export const queryKeys = {
  me: ['me'] as const,
  systemInfo: ['system', 'info'] as const,
  dashboard: {
    all: ['dashboard'] as const,
    overview: (days: number) => ['dashboard', 'overview', days] as const,
  },
};
