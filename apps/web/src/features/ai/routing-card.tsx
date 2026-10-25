import type { RoutingDto } from '@stockroom/shared';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';

/** Default model, ordered fallback chain, prefer-local, retries. */
export function RoutingCard({
  routing,
  canConfigure,
  onChange,
}: {
  routing: RoutingDto;
  canConfigure: boolean;
  onChange: (r: RoutingDto) => void;
}) {
  const move = (i: number, by: number) => {
    const next = [...routing.fallbacks];
    const [item] = next.splice(i, 1);
    if (item) next.splice(i + by, 0, item);
    onChange({ ...routing, fallbacks: next });
  };
  const overrides = Object.entries(routing.agentOverrides);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Routing</CardTitle>
          <CardDescription>
            Which model answers, and what happens when it can’t. Rate limits, timeouts and server errors are
            retried with backoff, then the next model is tried. If nothing answers, agents fall back to
            rule-based results.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">Default model</p>
          <p className="mt-1 text-sm text-fg-secondary">
            {routing.default ? (
              <>
                <span className="font-mono text-fg">{routing.default.modelId}</span> on{' '}
                {routing.default.providerKey}
              </>
            ) : (
              'Automatic — the first tool-capable local model, else a configured cloud provider’s suggestion. Pick one in the model browser.'
            )}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Fallback chain</p>
          {routing.fallbacks.length === 0 ? (
            <p className="mt-1 text-sm text-fg-secondary">
              None. Add models from the browser, e.g. Gemini → Groq → local Ollama.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1.5">
              {routing.fallbacks.map((f, i) => (
                <li
                  key={`${f.providerKey}/${f.modelId}`}
                  className="flex items-center gap-2 rounded-md border border-hairline px-3 py-1.5 text-sm"
                >
                  <span className="w-5 tabular text-xs text-fg-tertiary">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono">{f.modelId}</span>{' '}
                    <span className="text-fg-tertiary">· {f.providerKey}</span>
                  </span>
                  {canConfigure && (
                    <>
                      <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        size="sm"
                        disabled={i === routing.fallbacks.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown strokeWidth={1.75} />
                      </IconButton>
                      <IconButton
                        label="Remove"
                        size="sm"
                        onClick={() =>
                          onChange({ ...routing, fallbacks: routing.fallbacks.filter((_, j) => j !== i) })
                        }
                      >
                        <X strokeWidth={1.75} />
                      </IconButton>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Prefer local</span>
            <span className="block text-fg-secondary">
              Try a running Ollama model first; cloud models only when it can’t answer.
            </span>
          </span>
          <Switch
            checked={routing.preferLocal}
            disabled={!canConfigure}
            onCheckedChange={(v) => onChange({ ...routing, preferLocal: v })}
          />
        </label>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Retries per model</span>
            <span className="block text-fg-secondary">
              For rate limits, timeouts and server errors, honouring Retry-After.
            </span>
          </span>
          <Select
            aria-label="Retries per model"
            value={String(routing.maxRetries)}
            disabled={!canConfigure}
            onValueChange={(v) => onChange({ ...routing, maxRetries: Number(v) })}
            options={[0, 1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label: n === 0 ? 'None' : String(n),
            }))}
            className="w-28"
          />
        </div>
        {overrides.length > 0 && (
          <div>
            <p className="text-sm font-medium">Per-agent models</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {overrides.map(([agent, ref]) => (
                <li key={agent} className="flex items-center justify-between gap-2">
                  <span className="text-fg-secondary">{agent.replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{ref.modelId}</span>
                    {canConfigure && (
                      <IconButton
                        label={`Remove override for ${agent}`}
                        size="sm"
                        onClick={() =>
                          onChange({
                            ...routing,
                            agentOverrides: Object.fromEntries(overrides.filter(([a]) => a !== agent)),
                          })
                        }
                      >
                        <X strokeWidth={1.75} />
                      </IconButton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
