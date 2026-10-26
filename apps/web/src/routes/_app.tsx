import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CommandPalette } from '@/components/layout/command-palette';
import { Sidebar, SidebarContent } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { meQueryOptions, useLogout, useMe, useSavePreferences } from '@/lib/auth';
import { useLiveEvents } from '@/lib/live';
import { usePreferences } from '@/lib/preferences';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
    if (!me) {
      // A signed-out session must be re-checked next time, not served from cache.
      context.queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const me = useMe();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { preferences, setPreference, hydrate, setSync } = usePreferences();
  const savePreferences = useSavePreferences();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useLiveEvents();

  // The signed-in user's saved preferences win (they follow the user across browsers).
  useEffect(() => {
    hydrate(me.user.preferences);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the user changes
  }, [me.user.id]);

  useEffect(() => {
    setSync((patch) =>
      savePreferences.mutate(patch, {
        onError: () => toast.error('Couldn’t save your preference. It still applies here.'),
      }),
    );
    return () => setSync(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once
  }, []);

  const signOut = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        void navigate({ to: '/login' });
      },
    });

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={preferences.sidebarCollapsed}
        onToggle={() => setPreference('sidebarCollapsed', !preferences.sidebarCollapsed)}
      />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" hideClose aria-describedby={undefined} className="lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMenu={() => setMenuOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onSignOut={signOut}
        />
        <main id="main" className="flex-1 outline-none" tabIndex={-1}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onSignOut={signOut} />
    </div>
  );
}
