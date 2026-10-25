import type { ModelInfoDto, ModelRefDto } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Gauge, ListPlus, Search, Star, Wrench } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { reportError } from '@/lib/forms';
import { modelsQuery, useLatencyTest, useProbeModel } from './api';
import { CapabilityBadges, formatContext } from './capability-badges';

type Filter = 'all' | 'local' | 'free' | 'tools';

/** Every model from every enabled provider, fetched live. */
export function ModelBrowser({
  defaultModel,
  fallbacks,
  canConfigure,
  onSetDefault,
  onAddFallback,
}: {
  defaultModel: ModelRefDto | null;
  fallbacks: ModelRefDto[];
  canConfigure: boolean;
  onSetDefault: (m: ModelRefDto) => void;
  onAddFallback: (m: ModelRefDto) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('tools');
  const query = useQuery({
    ...modelsQuery({
      q: q || undefined,
      local: filter === 'local' ? true : undefined,
      free: filter === 'free' ? true : undefined,
      tools: filter === 'tools' ? true : undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const probe = useProbeModel();
  const latency = useLatencyTest();
  const [results, setResults] = useState<Record<string, string>>({});
  const id = (m: ModelInfoDto) => `${m.provider}/${m.id}`;
  const isDefault = (m: ModelInfoDto) =>
    defaultModel?.providerKey === m.provider && defaultModel.modelId === m.id;
  const inChain = (m: ModelInfoDto) =>
    fallbacks.some((f) => f.providerKey === m.provider && f.modelId === m.id);
  const models = query.data?.models ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-3 pb-4 sm:flex-row sm:items-start">
        <div>
          <CardTitle>Model browser</CardTitle>
          <CardDescription>
            Live from each enabled provider. Probe a model to learn whether it can call tools.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search models…"
          leading={<Search strokeWidth={1.75} />}
          className="sm:w-64"
        />
        <SegmentedControl
          aria-label="Filter models"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'tools', label: 'Tools' },
            { value: 'local', label: 'Local' },
            { value: 'free', label: 'Free' },
            { value: 'all', label: 'All' },
          ]}
        />
        {query.data && (
          <span className="ml-auto tabular text-xs text-fg-tertiary">{models.length} models</span>
        )}
      </div>
      {query.data?.errors.length ? (
        <p className="mx-5 mb-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          {query.data.errors.map((e) => `${e.provider}: ${e.message}`).join(' · ')}
        </p>
      ) : null}
      {query.isPending ? (
        <div className="flex flex-col gap-2 px-5 pb-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
      ) : models.length === 0 ? (
        <EmptyState
          compact
          icon={<Search strokeWidth={1.75} />}
          title="No models match"
          description="Enable a provider above, or start Ollama and pull a model."
        />
      ) : (
        <ul className="max-h-[480px] divide-y divide-hairline overflow-y-auto border-t border-hairline">
          {models.slice(0, 200).map((m) => (
            <li key={id(m)} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{m.displayName}</span>
                  {isDefault(m) && (
                    <StatusPill tone="success">
                      <Star className="size-3 fill-current" /> Default
                    </StatusPill>
                  )}
                  {inChain(m) && <StatusPill tone="accent">Fallback</StatusPill>}
                </p>
                <p className="truncate text-xs text-fg-tertiary">
                  <span className="font-mono">{m.id}</span> · {m.provider} · {m.isLocal ? 'local' : 'cloud'}
                  {m.isFree ? ' · free' : ''}
                  {m.contextWindow ? ` · ${formatContext(m.contextWindow)} context` : ''}
                </p>
                {results[id(m)] && <p className="mt-1 text-xs text-fg-secondary">{results[id(m)]}</p>}
              </div>
              <CapabilityBadges model={m} />
              {canConfigure && (
                <div className="flex flex-wrap gap-1.5">
                  {m.capabilities.tools !== true && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={probe.isPending && probe.variables.modelId === m.id}
                      onClick={() =>
                        probe.mutate(
                          { providerKey: m.provider, modelId: m.id },
                          {
                            onSuccess: (r) => setResults((s) => ({ ...s, [id(m)]: r.message })),
                            onError: (e) => reportError(e, undefined, 'Probe failed'),
                          },
                        )
                      }
                    >
                      <Wrench strokeWidth={1.75} /> Probe
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={latency.isPending && latency.variables.modelId === m.id}
                    onClick={() =>
                      latency.mutate(
                        { providerKey: m.provider, modelId: m.id },
                        {
                          onSuccess: (r) =>
                            setResults((s) => ({
                              ...s,
                              [id(m)]: r.ok
                                ? `First token in ${r.firstTokenMs ?? '—'} ms · done in ${r.totalMs} ms · “${r.output}”`
                                : `Failed: ${r.message}`,
                            })),
                          onError: (e) => reportError(e, undefined, 'Latency test failed'),
                        },
                      )
                    }
                  >
                    <Gauge strokeWidth={1.75} /> Latency
                  </Button>
                  {!inChain(m) && !isDefault(m) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddFallback({ providerKey: m.provider, modelId: m.id })}
                    >
                      <ListPlus strokeWidth={1.75} /> Fallback
                    </Button>
                  )}
                  {!isDefault(m) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onSetDefault({ providerKey: m.provider, modelId: m.id });
                        if (m.capabilities.tools === false)
                          toast.info(
                            'This model has no native tool calls; agents will use the JSON protocol with it.',
                          );
                      }}
                    >
                      Use as default
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
