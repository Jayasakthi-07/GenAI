import { Page } from '../layout/page-header';
import { Skeleton } from '../ui/misc';

/** Neutral skeleton shown while a route's code or data loads. */
export function PageLoading() {
  return (
    <Page role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-4 h-80 rounded-lg" />
    </Page>
  );
}
