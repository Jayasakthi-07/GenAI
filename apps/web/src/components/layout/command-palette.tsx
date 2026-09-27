import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect } from 'react';
import { useCan } from '@/lib/auth';
import { FOOTER_NAV, NAV } from '@/lib/nav';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { Kbd } from '../ui/misc';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}

const itemClasses = cn(
  'flex h-10 cursor-default items-center gap-3 rounded-md px-3 text-sm text-fg select-none',
  'data-[selected=true]:bg-accent-soft [&_svg]:size-[18px] [&_svg]:text-fg-tertiary',
);

/** ⌘K / Ctrl+K: jump anywhere, run actions. Record search is added as those modules ship. */
export function CommandPalette({ open, onOpenChange, onSignOut }: CommandPaletteProps) {
  const navigate = useNavigate();
  const can = useCan();
  const { setPreference } = usePreferences();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const pages = [...NAV.flatMap((g) => g.items), ...FOOTER_NAV].filter(
    (i) => !i.permission || can(i.permission),
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 animate-scale-in overflow-hidden rounded-xl border border-hairline bg-elevated shadow-float outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search className="size-[18px] shrink-0 text-fg-tertiary" strokeWidth={1.75} />
              <Command.Input
                autoFocus
                placeholder="Search pages and actions…"
                className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-tertiary"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-fg-secondary">
                No matches.
              </Command.Empty>
              <Command.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-tertiary"
              >
                {pages.map((item) => (
                  <Command.Item
                    key={item.to}
                    value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => run(() => void navigate({ to: item.to }))}
                    className={itemClasses}
                  >
                    <item.icon strokeWidth={1.75} />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group
                heading="Appearance"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-tertiary"
              >
                <Command.Item
                  value="Light theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'light'))}
                  className={itemClasses}
                >
                  <Sun strokeWidth={1.75} /> Use light theme
                </Command.Item>
                <Command.Item
                  value="Dark theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'dark'))}
                  className={itemClasses}
                >
                  <Moon strokeWidth={1.75} /> Use dark theme
                </Command.Item>
                <Command.Item
                  value="System theme appearance"
                  onSelect={() => run(() => setPreference('theme', 'system'))}
                  className={itemClasses}
                >
                  <Monitor strokeWidth={1.75} /> Match system theme
                </Command.Item>
              </Command.Group>
              <Command.Group
                heading="Account"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-tertiary"
              >
                <Command.Item
                  value="Sign out log out"
                  onSelect={() => run(onSignOut)}
                  className={itemClasses}
                >
                  <LogOut strokeWidth={1.75} /> Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
