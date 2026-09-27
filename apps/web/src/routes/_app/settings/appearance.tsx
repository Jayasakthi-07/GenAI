import { createFileRoute } from '@tanstack/react-router';
import { Monitor, Moon, Rows3, Rows4, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/tabs';
import { type DensityPreference, type ThemePreference, usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings/appearance')({
  staticData: { title: 'Appearance' },
  component: AppearanceSettings,
});

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      data-theme={theme}
      className="pointer-events-none flex h-20 overflow-hidden rounded-md border border-hairline bg-canvas"
      aria-hidden
    >
      <div className="w-1/4 border-r border-hairline bg-surface-2 p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-accent" />
        <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-hairline-strong" />
        <div className="mt-1 h-1.5 w-1/2 rounded-full bg-hairline-strong" />
      </div>
      <div className="flex-1 p-2">
        <div className="h-2 w-1/2 rounded-full bg-fg/70" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="h-8 rounded-sm border border-hairline bg-surface" />
          <div className="h-8 rounded-sm border border-hairline bg-surface" />
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const { preferences, setPreference } = usePreferences();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Choose a look, or follow your computer’s setting.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const selected = preferences.theme === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPreference('theme', t.value)}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-2 text-left transition-[border-color,box-shadow] duration-150',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                    selected
                      ? 'border-accent ring-3 ring-accent-soft'
                      : 'border-hairline hover:border-hairline-strong',
                  )}
                >
                  {t.value === 'system' ? (
                    <div className="grid grid-cols-2 overflow-hidden rounded-md">
                      <div className="[&>div]:rounded-r-none [&>div]:border-r-0">
                        <ThemePreview theme="light" />
                      </div>
                      <div className="[&>div]:rounded-l-none">
                        <ThemePreview theme="dark" />
                      </div>
                    </div>
                  ) : (
                    <ThemePreview theme={t.value} />
                  )}
                  <span className="flex items-center gap-1.5 px-0.5 text-sm font-medium">
                    <t.icon className="size-4 text-fg-secondary" strokeWidth={1.75} />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Table density</CardTitle>
            <CardDescription>
              Compact rows fit more on screen; comfortable rows are easier to scan.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SegmentedControl
            aria-label="Table density"
            value={preferences.density}
            onValueChange={(v: DensityPreference) => setPreference('density', v)}
            options={[
              { value: 'comfortable', label: 'Comfortable', icon: <Rows3 strokeWidth={1.75} /> },
              { value: 'compact', label: 'Compact', icon: <Rows4 strokeWidth={1.75} /> },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-6 pt-5">
          <div>
            <Label htmlFor="sidebar-collapsed">Collapse the sidebar</Label>
            <p className="mt-0.5 text-sm text-fg-secondary">Show icons only, to give pages more room.</p>
          </div>
          <Switch
            id="sidebar-collapsed"
            checked={preferences.sidebarCollapsed}
            onCheckedChange={(checked) => setPreference('sidebarCollapsed', checked)}
          />
        </CardContent>
      </Card>

      <p className="px-1 text-sm text-fg-tertiary">
        Motion follows your system’s “reduce motion” setting. Preferences are saved to your account.
      </p>
    </div>
  );
}
