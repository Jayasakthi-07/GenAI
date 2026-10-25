import {
  formatNumber,
  PROVIDER_HEALTH_LABELS,
  type ConnectionTest,
  type ProviderDto,
  type ProviderHealth,
} from '@stockroom/shared';
import { ExternalLink, KeyRound, PlugZap, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusPill, type StatusTone } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useDeleteProvider, useTestProvider, useUpdateProvider } from './api';

export const HEALTH_TONES: Record<ProviderHealth, StatusTone> = {
  CONNECTED: 'success',
  INVALID_KEY: 'warning',
  RATE_LIMITED: 'warning',
  OFFLINE: 'danger',
  UNKNOWN: 'neutral',
};

/** A cloud (or custom) provider: enable, key, base URL, limits, connection test. */
export function ProviderCard({ provider: p }: { provider: ProviderDto }) {
  const update = useUpdateProvider();
  const test = useTestProvider();
  const remove = useDeleteProvider();
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [limits, setLimits] = useState({
    rpm: String(p.settings.rpm),
    dailyBudget: String(p.settings.dailyBudget),
    timeoutS: String(Math.round(p.settings.timeoutMs / 1000)),
  });
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editableUrl = p.isCustom || p.isLocal;
  const health = p.isEnabled ? p.health : 'UNKNOWN';

  const save = (patch: Omit<Parameters<typeof update.mutate>[0], 'key'>, done: string, after?: () => void) =>
    update.mutate(
      { key: p.key, ...patch },
      {
        onSuccess: () => (toast.success(done), after?.()),
        onError: (e) => reportError(e, undefined, 'Couldn’t save'),
      },
    );

  const runTest = () =>
    test.mutate(p.key, {
      onSuccess: (r) => {
        setResult(r);
        if (r.status === 'connected')
          toast.success(`${p.displayName} connected`, {
            description: r.modelCount !== null ? `${formatNumber(r.modelCount)} models available` : undefined,
          });
        else toast.error(`${p.displayName}: ${r.message ?? r.status}`);
      },
      onError: (e) => reportError(e, undefined, 'Test failed'),
    });

  return (
    <Card className={cn('flex flex-col gap-4 p-5', !p.isEnabled && 'bg-surface-2/60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold tracking-tight">
            {p.displayName}
            <StatusPill tone={p.isEnabled ? HEALTH_TONES[health] : 'neutral'}>
              {p.isEnabled ? PROVIDER_HEALTH_LABELS[health] : 'Off'}
            </StatusPill>
            {p.freeTier && <span className="text-xs font-normal text-fg-tertiary">Free tier</span>}
          </p>
          <p className="mt-0.5 text-sm text-fg-secondary">{p.description}</p>
        </div>
        <Switch
          aria-label={`Use ${p.displayName}`}
          checked={p.isEnabled}
          onCheckedChange={(v) =>
            save({ isEnabled: v }, v ? `${p.displayName} enabled` : `${p.displayName} disabled`)
          }
        />
      </div>

      {p.isEnabled && p.healthMessage && health !== 'CONNECTED' && (
        <p className="rounded-md bg-neutral-soft px-3 py-2 text-xs text-fg-secondary">{p.healthMessage}</p>
      )}

      {p.requiresKey && p.kind !== 'MOCK' && (
        <Field
          label="API key"
          hint={
            p.keySource === 'ui'
              ? `Saved, encrypted. Ends in ${p.apiKeyLast4}.`
              : p.keySource === 'env'
                ? `Using the key from .env (ends in ${p.apiKeyLast4}). A key saved here takes precedence.`
                : 'Stored encrypted on this computer; never shown again.'
          }
          aside={
            p.keyUrl ? (
              <a
                href={p.keyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
              >
                Get a key <ExternalLink className="size-3" />
              </a>
            ) : undefined
          }
        >
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={p.apiKeyLast4 ? `•••• ${p.apiKeyLast4}` : 'Paste a key'}
              leading={<KeyRound strokeWidth={1.75} />}
            />
            <Button
              variant="secondary"
              disabled={!key.trim()}
              loading={update.isPending && Boolean(key)}
              onClick={() => save({ apiKey: key.trim(), isEnabled: true }, 'Key saved', () => setKey(''))}
            >
              Save
            </Button>
          </div>
        </Field>
      )}
      {p.keySource === 'ui' && (
        <button
          type="button"
          className="-mt-2 self-start text-xs text-fg-tertiary hover:text-danger"
          onClick={() => save({ apiKey: '' }, 'Key removed')}
        >
          Remove saved key
        </button>
      )}

      {editableUrl && (
        <Field label="Base URL">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => baseUrl !== p.baseUrl && save({ baseUrl }, 'Base URL saved')}
            className="font-mono"
          />
        </Field>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-secondary select-none hover:text-fg">
          Limits · {formatNumber(p.callsToday)}
          {p.settings.dailyBudget ? ` of ${formatNumber(p.settings.dailyBudget)}` : ''} calls today
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Field label="Per minute" hint="0 = no limit">
            <Input
              type="number"
              min={0}
              value={limits.rpm}
              onChange={(e) => setLimits((l) => ({ ...l, rpm: e.target.value }))}
              className="tabular"
            />
          </Field>
          <Field label="Per day" hint="0 = no limit">
            <Input
              type="number"
              min={0}
              value={limits.dailyBudget}
              onChange={(e) => setLimits((l) => ({ ...l, dailyBudget: e.target.value }))}
              className="tabular"
            />
          </Field>
          <Field label="Timeout (s)">
            <Input
              type="number"
              min={5}
              value={limits.timeoutS}
              onChange={(e) => setLimits((l) => ({ ...l, timeoutS: e.target.value }))}
              className="tabular"
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() =>
            save(
              {
                settings: {
                  rpm: Number(limits.rpm),
                  dailyBudget: Number(limits.dailyBudget),
                  timeoutMs: Math.max(5, Number(limits.timeoutS)) * 1000,
                },
              },
              'Limits saved',
            )
          }
        >
          Save limits
        </Button>
      </details>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={runTest}
          loading={test.isPending}
          disabled={!p.isEnabled}
        >
          <PlugZap strokeWidth={1.75} /> Test connection
        </Button>
        {result && (
          <span className={cn('text-xs', result.status === 'connected' ? 'text-success' : 'text-danger')}>
            {result.status === 'connected'
              ? `OK${result.latencyMs !== null ? ` · ${result.latencyMs} ms` : ''}${result.modelCount !== null ? ` · ${formatNumber(result.modelCount)} models` : ''}`
              : (result.message ?? result.status)}
          </span>
        )}
        {p.isCustom && (
          <IconButton label={`Remove ${p.displayName}`} className="ml-auto" onClick={() => setDeleting(true)}>
            <Trash2 strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${p.displayName}?`}
        description="Its key is deleted and it’s removed from routing."
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(p.key, {
            onSuccess: () => (toast.success('Provider removed'), setDeleting(false)),
            onError: (e) => reportError(e, undefined, 'Couldn’t remove'),
          })
        }
      />
    </Card>
  );
}
