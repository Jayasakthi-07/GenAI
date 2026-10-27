import { type UserPreferences, userPreferencesSchema } from '@stockroom/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = UserPreferences['theme'];
export type DensityPreference = UserPreferences['density'];

const STORAGE_KEY = 'stockroom.theme';
const PREFS_KEY = 'stockroom.prefs';

// Browser storage can be unavailable (private windows, blocked site data); every access is guarded.
function readLocal(): Partial<UserPreferences> {
  try {
    const theme = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const rest = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<UserPreferences>;
    return { ...rest, ...(theme ? { theme } : {}) };
  } catch {
    return {};
  }
}

function writeLocal(prefs: UserPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, prefs.theme);
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ density: prefs.density, sidebarCollapsed: prefs.sidebarCollapsed }),
    );
  } catch {
    // Not persisted locally; the server copy still applies after sign-in.
  }
}

const DEFAULTS: UserPreferences = userPreferencesSchema.parse({});

interface PreferencesContextValue {
  preferences: UserPreferences;
  resolvedTheme: 'light' | 'dark';
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  /** Adopt the signed-in user's saved preferences (server copy wins across devices). */
  hydrate: (prefs: UserPreferences) => void;
  /** Called after local changes so the server copy can be updated. */
  setSync: (fn: ((prefs: Partial<UserPreferences>) => void) | null) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({ ...DEFAULTS, ...readLocal() }));
  const [prefersDark, setPrefersDark] = useState(systemDark);
  const [sync, setSyncFn] = useState<((prefs: Partial<UserPreferences>) => void) | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = preferences.theme === 'system' ? (prefersDark ? 'dark' : 'light') : preferences.theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-density', preferences.density);
  }, [resolvedTheme, preferences.density]);

  const setPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        writeLocal(next);
        return next;
      });
      sync?.({ [key]: value });
    },
    [sync],
  );

  const hydrate = useCallback((prefs: UserPreferences) => {
    setPreferences(prefs);
    writeLocal(prefs);
  }, []);

  const setSync = useCallback(
    (fn: ((prefs: Partial<UserPreferences>) => void) | null) => setSyncFn(() => fn),
    [],
  );

  const value = useMemo(
    () => ({ preferences, resolvedTheme, setPreference, hydrate, setSync }),
    [preferences, resolvedTheme, setPreference, hydrate, setSync],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
