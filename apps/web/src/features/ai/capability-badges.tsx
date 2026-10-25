import type { ModelInfoDto } from '@stockroom/shared';
import { Brain, Eye, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/menus';

/** Tools · Vision · Thinking, as reported by the provider (or learned by a probe). */
export function CapabilityBadges({ model }: { model: Pick<ModelInfoDto, 'capabilities'> }) {
  const c = model.capabilities;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {c.tools === true && (
        <Badge tone="accent">
          <Wrench /> Tools
        </Badge>
      )}
      {c.tools === null && (
        <Tooltip content="The provider doesn’t say. Probe it to find out.">
          <Badge tone="outline">
            <Wrench /> Tools?
          </Badge>
        </Tooltip>
      )}
      {c.tools === false && (
        <Tooltip content="No native tool calls. Agents will use a JSON protocol instead, which works but is less reliable.">
          <Badge tone="warning">
            <Wrench /> No tools
          </Badge>
        </Tooltip>
      )}
      {c.vision && (
        <Badge>
          <Eye /> Vision
        </Badge>
      )}
      {c.thinking && (
        <Badge>
          <Brain /> Thinking
        </Badge>
      )}
    </span>
  );
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function formatContext(tokens: number | null): string {
  if (!tokens) return '—';
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens);
}
