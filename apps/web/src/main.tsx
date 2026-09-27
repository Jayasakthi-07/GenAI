import '@fontsource-variable/inter';
import './styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/ui/menus';
import { ApiError, setUnauthenticatedHandler } from './lib/api';
import { PreferencesProvider, usePreferences } from './lib/preferences';
import { createAppRouter } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't hammer the server for errors a retry can't fix.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const router = createAppRouter(queryClient);

setUnauthenticatedHandler(() => {
  queryClient.removeQueries({ queryKey: ['me'] });
  if (router.state.location.pathname !== '/login') {
    void router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
  }
});

function ThemedToaster() {
  const { resolvedTheme } = usePreferences();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border !border-hairline !bg-elevated !text-fg !shadow-float !font-sans',
          description: '!text-fg-secondary',
          actionButton: '!bg-accent !text-accent-fg',
        },
      }}
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={400}>
            <RouterProvider router={router} />
            <ThemedToaster />
          </TooltipProvider>
        </MotionConfig>
      </PreferencesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
