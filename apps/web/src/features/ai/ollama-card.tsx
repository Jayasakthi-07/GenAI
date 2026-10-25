import type { ModelRefDto, ProviderDto } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Cpu, RefreshCw, Star, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusPill } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd, Skeleton } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/menus';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { ollamaQuery, useUpdateProvider } from './api';
import { CapabilityBadges, formatBytes, formatContext } from './capability-badges';

/** Live Ollama status: polled every 10 s while visible, with a manual refresh. */
export function OllamaCard({
  provider,
  defaultModel,
  onUseModel,
}: {
  provider: ProviderDto;
  defaultModel: ModelRefDto | null;
  onUseModel: (modelId: string) => void;
}) {
  const q = useQuery({ ...ollamaQuery, enabled: provider.isEnabled });
  const update = useUpdateProvider();
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [numCtx, setNumCtx] = useState(String(provider.settings.numCtx));
  const s = q.data;
  const save = (patch: Parameters<typeof update.mutate>[0], done: string) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(done),
      onError: (e) => reportError(e, undefined, 'Couldn’t save'),
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-soft text-fg-secondary">
            <Cpu className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <CardTitle className="flex items-center gap-2">
              Ollama
              {!provider.isEnabled ? (
                <StatusPill>Disabled</StatusPill>
              ) : q.isPending ? null : s?.running ? (
                <StatusPill tone="success" pulse>
                  Running · v{s.version}
                </StatusPill>
              ) : (
                <StatusPill tone="danger">Not running</StatusPill>
              )}
            </CardTitle>
            <CardDescription>
              Models on this computer. Works with the internet off. Checked every 10 seconds.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Refresh" onClick={() => void q.refetch()} disabled={!provider.isEnabled}>
            <RefreshCw className={cn(q.isFetching && 'animate-spin')} strokeWidth={1.75} />
          </IconButton>
          <Switch
            aria-label="Use Ollama"
            checked={provider.isEnabled}
            onCheckedChange={(v) =>
              save({ key: provider.key, isEnabled: v }, v ? 'Ollama enabled' : 'Ollama disabled')
            }
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {provider.isEnabled && q.isPending && <Skeleton className="h-24" />}
        {provider.isEnabled && s && !s.running && (
          <div className="rounded-lg border border-dashed border-hairline-strong p-4 text-sm">
            <p className="font-medium">Ollama isn’t running at {s.baseUrl}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-fg-secondary">
              <li>
                Start the Ollama app (or run <Kbd className="font-mono">ollama serve</Kbd>).
              </li>
              <li>
                Pull a model that can call tools, e.g. <Kbd className="font-mono">ollama pull qwen3:8b</Kbd>.
              </li>
              <li>It appears here within seconds — no restart needed.</li>
            </ol>
          </div>
        )}
        {s?.running && s.models.length === 0 && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Ollama is running but has no models. Run <Kbd className="font-mono">ollama pull qwen3:8b</Kbd>.
          </p>
        )}
        {s?.running && s.models.length > 0 && (
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
            {s.models.map((m) => {
              const isDefault = defaultModel?.providerKey === 'ollama' && defaultModel.modelId === m.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="font-mono">{m.id}</span>
                      {m.loaded && (
                        <StatusPill tone="accent" pulse>
                          In memory
                        </StatusPill>
                      )}
                      {isDefault && (
                        <StatusPill tone="success">
                          <Star className="size-3 fill-current" /> Default
                        </StatusPill>
                      )}
                    </p>
                    <p className="mt-0.5 tabular text-xs text-fg-tertiary">
                      {[
                        m.parameterSize,
                        m.quantization,
                        formatBytes(m.sizeBytes),
                        m.contextWindow ? `${formatContext(m.contextWindow)} context` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <CapabilityBadges model={m} />
                  {m.capabilities.tools === false && (
                    <Tooltip content="This model can’t call tools natively. Agents fall back to a JSON protocol, which is slower and less reliable.">
                      <TriangleAlert
                        className="size-4 text-warning"
                        strokeWidth={1.75}
                        aria-label="No tool support"
                      />
                    </Tooltip>
                  )}
                  {!isDefault && (
                    <Button variant="secondary" size="sm" onClick={() => onUseModel(m.id)}>
                      Use as default
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <details className="group text-sm">
          <summary className="cursor-pointer text-fg-secondary select-none hover:text-fg">
            Connection and performance
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Base URL" hint="Default http://127.0.0.1:11434">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() =>
                  baseUrl !== provider.baseUrl && save({ key: provider.key, baseUrl }, 'Base URL saved')
                }
                className="font-mono"
              />
            </Field>
            <Field
              label="Context window (num_ctx)"
              hint="Ollama’s default is small and silently cuts long prompts"
            >
              <Input
                type="number"
                min={2048}
                step={1024}
                value={numCtx}
                onChange={(e) => setNumCtx(e.target.value)}
                onBlur={() =>
                  Number(numCtx) !== provider.settings.numCtx &&
                  save({ key: provider.key, settings: { numCtx: Number(numCtx) } }, 'Context window saved')
                }
                className="tabular"
              />
            </Field>
            <label className="flex items-center justify-between gap-3 sm:col-span-2">
              <span>
                <span className="font-medium">Turn off thinking</span>
                <span className="block text-fg-secondary">
                  Faster answers from reasoning models; traces won’t show their thoughts.
                </span>
              </span>
              <Switch
                checked={provider.settings.disableThinking}
                onCheckedChange={(v) =>
                  save(
                    { key: provider.key, settings: { disableThinking: v } },
                    v ? 'Thinking turned off' : 'Thinking turned on',
                  )
                }
              />
            </label>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
