import type { ModelRefDto, RoutingDto } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Bot, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/feedback/states';
import { StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import {
  aiStatusQuery,
  providersQuery,
  routingQuery,
  useCreateProvider,
  useSaveRouting,
} from '@/features/ai/api';
import { ModelBrowser } from '@/features/ai/model-browser';
import { OllamaCard } from '@/features/ai/ollama-card';
import { ProviderCard } from '@/features/ai/provider-card';
import { RoutingCard } from '@/features/ai/routing-card';
import { UsageCard } from '@/features/ai/usage-card';
import { meQueryOptions, useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/ai')({
  staticData: { title: 'AI & models' },
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me?.permissions.includes('agents.configure')) throw redirect({ to: '/settings/organization' });
  },
  component: AiSettings,
});

function AiSettings() {
  const can = useCan();
  const isAdmin = can('ai.configure');
  const canConfigure = can('agents.configure');
  const status = useQuery(aiStatusQuery);
  const providers = useQuery({ ...providersQuery, enabled: isAdmin });
  const routing = useQuery(routingQuery);
  const saveRouting = useSaveRouting();
  const [showMore, setShowMore] = useState(false);
  const [adding, setAdding] = useState(false);

  const save = (next: RoutingDto, message: string) =>
    saveRouting.mutate(next, {
      onSuccess: () => toast.success(message),
      onError: (e) => reportError(e, undefined, 'Couldn’t save routing'),
    });
  const setDefault = (m: ModelRefDto) =>
    routing.data &&
    save(
      {
        ...routing.data,
        default: m,
        fallbacks: routing.data.fallbacks.filter(
          (f) => !(f.providerKey === m.providerKey && f.modelId === m.modelId),
        ),
      },
      `${m.modelId} is now the default model`,
    );
  const addFallback = (m: ModelRefDto) =>
    routing.data &&
    save(
      { ...routing.data, fallbacks: [...routing.data.fallbacks, m] },
      `${m.modelId} added to the fallback chain`,
    );

  const list = providers.data ?? [];
  const ollama = list.find((p) => p.key === 'ollama');
  const primary = list.filter((p) => p.key !== 'ollama' && !p.secondary && !p.isCustom);
  const secondary = list.filter((p) => p.secondary && !p.isCustom);
  const custom = list.filter((p) => p.isCustom);
  const visibleSecondary = showMore ? secondary : secondary.filter((p) => p.isEnabled || p.hasKey);
  const active = status.data?.active;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
          <Bot className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          {status.isPending ? (
            <Skeleton className="h-10 w-72" />
          ) : status.data?.mode === 'AI' && active ? (
            <>
              <p className="font-semibold tracking-tight">
                Agents use <span className="font-mono">{active.displayName}</span>
              </p>
              <p className="text-sm text-fg-secondary">
                {active.providerName} · {active.isLocal ? 'on this computer' : 'cloud'}
                {status.data.configured ? '' : ' · picked automatically'}
                {active.tools === false ? ' · JSON protocol (no native tools)' : ''}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold tracking-tight">No AI model available — rule-based mode</p>
              <p className="text-sm text-fg-secondary">
                Alerts and recommendations still work, labelled “Rule-based”. Start Ollama or add a cloud key
                to turn on AI.
              </p>
            </>
          )}
        </div>
        <StatusPill tone={status.data?.mode === 'AI' ? 'success' : 'warning'}>
          {status.data?.mode === 'AI' ? 'AI on' : 'Rule-based'}
        </StatusPill>
      </Card>

      {isAdmin ? (
        providers.isPending ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : providers.isError ? (
          <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />
        ) : (
          <>
            {ollama && (
              <OllamaCard
                provider={ollama}
                defaultModel={routing.data?.default ?? null}
                onUseModel={(modelId) => setDefault({ providerKey: 'ollama', modelId })}
              />
            )}
            <section aria-labelledby="cloud-heading" className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 id="cloud-heading" className="text-base font-semibold tracking-tight">
                    Cloud providers
                  </h3>
                  <p className="text-sm text-fg-secondary">
                    Keys are encrypted on this computer and never shown again. Only these calls leave the
                    computer.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                  <Plus strokeWidth={1.75} /> Custom endpoint
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[...primary, ...visibleSecondary, ...custom].map((p) => (
                  <ProviderCard key={p.key} provider={p} />
                ))}
              </div>
              {secondary.length > visibleSecondary.length && (
                <div className="flex flex-col items-start gap-0.5">
                  <Button variant="ghost" size="sm" onClick={() => setShowMore(true)}>
                    Show {secondary.length - visibleSecondary.length} more providers
                  </Button>
                  <p className="px-3 text-xs text-fg-tertiary">
                    {secondary.map((p) => p.displayName).join(', ')}
                  </p>
                </div>
              )}
            </section>
          </>
        )
      ) : (
        <p className="flex items-center gap-2 rounded-md bg-neutral-soft px-3 py-2 text-sm text-fg-secondary">
          <Lock className="size-4" strokeWidth={1.75} /> Only admins can add providers and API keys. You can
          choose models and routing.
        </p>
      )}

      {routing.data && (
        <>
          <ModelBrowser
            defaultModel={routing.data.default}
            fallbacks={routing.data.fallbacks}
            canConfigure={canConfigure}
            onSetDefault={setDefault}
            onAddFallback={addFallback}
          />
          <RoutingCard
            routing={routing.data}
            canConfigure={canConfigure}
            onChange={(r) => save(r, 'Routing saved')}
          />
        </>
      )}
      <UsageCard />
      <CustomProviderDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function CustomProviderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateProvider();
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { displayName: name.trim(), baseUrl: baseUrl.trim(), apiKey: key.trim() || undefined },
              {
                onSuccess: (p) => {
                  toast.success(`Added ${p.displayName}`, {
                    description:
                      p.health === 'CONNECTED' ? 'Connected.' : (p.healthMessage ?? 'Not reachable yet.'),
                  });
                  onOpenChange(false);
                  setName('');
                  setBaseUrl('');
                  setKey('');
                },
                onError: (err) => reportError(err, undefined, 'Couldn’t add the provider'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Custom OpenAI-compatible endpoint</DialogTitle>
            <DialogDescription>
              Any server that speaks the OpenAI chat-completions API (vLLM, llama.cpp server, a company
              gateway…).
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lab server"
                autoFocus
              />
            </Field>
            <Field
              label="Base URL"
              required
              hint="The part before /chat/completions, e.g. http://127.0.0.1:8000/v1"
            >
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono" />
            </Field>
            <Field label="API key" hint="Optional for local servers">
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim() || !baseUrl.trim()}
            >
              Add endpoint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
