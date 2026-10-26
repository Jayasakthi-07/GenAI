import { ROLE_LABELS } from '@stockroom/shared';
import { Link, useMatches } from '@tanstack/react-router';
import { Info, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, UserRound } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { type ThemePreference, usePreferences } from '@/lib/preferences';
import { cn, modKey } from '@/lib/utils';
import { AgentActivity } from '../ai/agent-activity';
import { ModelChip } from '../ai/model-chip';
import { IconButton } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menus';
import { Avatar, Kbd } from '../ui/misc';

interface TopBarProps {
  onOpenMenu: () => void;
  onOpenPalette: () => void;
  onSignOut: () => void;
}

function usePageTitle(): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const title = matches[i]?.staticData?.title;
    if (title) return title;
  }
  return '';
}

export function TopBar({ onOpenMenu, onOpenPalette, onSignOut }: TopBarProps) {
  const { user } = useMe();
  const { preferences, resolvedTheme, setPreference } = usePreferences();
  const title = usePageTitle();
  const ThemeIcon = preferences.theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-3 material sm:px-5">
      <IconButton label="Open navigation" className="lg:hidden" onClick={onOpenMenu}>
        <Menu strokeWidth={1.75} />
      </IconButton>
      <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className={cn(
            'hidden h-8 w-56 items-center gap-2 rounded-md border border-hairline bg-surface/60 px-2.5 text-sm text-fg-tertiary md:flex',
            'transition-colors hover:border-hairline-strong hover:text-fg-secondary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          )}
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </button>
        <IconButton label="Search" className="md:hidden" onClick={onOpenPalette}>
          <Search strokeWidth={1.75} />
        </IconButton>

        <AgentActivity />
        <ModelChip />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="Theme">
              <ThemeIcon strokeWidth={1.75} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preferences.theme}
              onValueChange={(v) => setPreference('theme', v as ThemePreference)}
            >
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account: ${user.name}`}
              className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <Avatar name={user.name} className="size-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={user.name} className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-fg-tertiary">
                  {ROLE_LABELS[user.role]} · {user.email}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings/account">
                <UserRound /> Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings/appearance">
                <Settings /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/about">
                <Info /> About
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
