import { APP_NAME } from '@stockroom/shared';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useMatches,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { Compass } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function Root() {
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.staticData?.title)?.staticData?.title;
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <EmptyState
        icon={<Compass strokeWidth={1.75} />}
        title="Page not found"
        description="The page you’re looking for doesn’t exist or has moved."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to the dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="flex flex-col items-center">
        <BrandMark className="size-9" />
        <ErrorState
          error={error}
          title="Something went wrong"
          onRetry={() => {
            reset();
            void router.invalidate();
          }}
        />
      </div>
    </div>
  );
}
