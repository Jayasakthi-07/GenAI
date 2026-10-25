import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ChevronDown, Cloud, Cpu, Settings2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { aiStatusQuery, modelsQuery, routingQuery, useSaveRouting } from '@/features/ai/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menus';

/** The active model in the top bar; switching it changes the default model for agents and chat. */
export function ModelChip() {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const status = useQuery(aiStatusQuery);
  const models = useQuery({ ...modelsQuery({ tools: true }), enabled: open });
  const routing = useQuery({ ...routingQuery, enabled: open });
  const save = useSaveRouting();
  const active = status.data?.active;
  const ai = status.data?.mode === 'AI' && active;

  if (status.isPending) return <span className="hidden h-8 w-36 skeleton rounded-md sm:block" aria-hidden />;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'hidden h-8 max-w-56 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors sm:inline-flex',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
            ai
              ? 'border-hairline bg-surface/60 text-fg-secondary hover:text-fg'
              : 'border-warning/40 bg-warning-soft text-warning',
          )}
          aria-label={ai ? `Model: ${active.displayName}` : 'AI unavailable: rule-based mode'}
        >
          {ai ? (
            active.isLocal ? (
              <Cpu className="size-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <Cloud className="size-4 shrink-0" strokeWidth={1.75} />
            )
          ) : (
            <Sparkles className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          <span className="truncate font-medium">{ai ? active.displayName : 'Rule-based'}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>
          {ai
            ? `${active.providerName} · ${active.isLocal ? 'local' : 'cloud'}`
            : 'No model reachable — agents use rules'}
        </DropdownMenuLabel>
        {can('agents.configure') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Default model</DropdownMenuLabel>
            <div className="max-h-64 overflow-y-auto">
              {models.isPending && <p className="px-2.5 py-2 text-sm text-fg-tertiary">Loading models…</p>}
              {models.data?.models.length === 0 && (
                <p className="px-2.5 py-2 text-sm text-fg-tertiary">
                  No tool-capable models. Set one up in Settings.
                </p>
              )}
              {models.data?.models.slice(0, 30).map((m) => {
                const selected = active?.providerKey === m.provider && active.modelId === m.id;
                return (
                  <DropdownMenuItem
                    key={`${m.provider}/${m.id}`}
                    onSelect={() =>
                      routing.data &&
                      save.mutate(
                        { ...routing.data, default: { providerKey: m.provider, modelId: m.id } },
                        {
                          onSuccess: () => toast.success(`Using ${m.displayName}`),
                          onError: (e) => reportError(e, undefined, 'Couldn’t switch model'),
                        },
                      )
                    }
                  >
                    {m.isLocal ? <Cpu /> : <Cloud />}
                    <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                    {selected && <Check className="!text-accent-text" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings/ai">
                <Settings2 /> AI & models settings
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
