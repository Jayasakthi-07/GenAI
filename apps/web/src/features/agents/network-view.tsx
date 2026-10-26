import type { AgentGraph, AgentKey } from '@stockroom/shared';
import { useNavigate } from '@tanstack/react-router';
import { ArrowDown } from 'lucide-react';
import { useMediaQuery } from '@/lib/use-media-query';
import { AGENT_ICONS, RunStatusPill } from './ui';

const W = 220;
const H = 72;
const COL_GAP = 180;
const ROW_GAP = 28;

/** Column per hand-off depth: agents nobody hands to on the left, their recipients to the right. */
function layout(graph: AgentGraph) {
  const depth = new Map<AgentKey, number>(graph.nodes.map((n) => [n.key, 0]));
  for (let pass = 0; pass < graph.nodes.length; pass++)
    for (const e of graph.edges)
      depth.set(e.to, Math.max(depth.get(e.to) ?? 0, (depth.get(e.from) ?? 0) + 1));
  const columns: AgentKey[][] = [];
  for (const n of graph.nodes) (columns[depth.get(n.key) ?? 0] ??= []).push(n.key);
  const pos = new Map<AgentKey, { x: number; y: number }>();
  const tallest = Math.max(...columns.map((c) => c.length));
  columns.forEach((col, ci) => {
    const offset = ((tallest - col.length) * (H + ROW_GAP)) / 2;
    col.forEach((key, ri) => pos.set(key, { x: ci * (W + COL_GAP), y: offset + ri * (H + ROW_GAP) }));
  });
  return {
    pos,
    width: Math.max(1, columns.length) * W + Math.max(0, columns.length - 1) * COL_GAP,
    height: tallest * H + Math.max(0, tallest - 1) * ROW_GAP,
  };
}

/** How the agents hand work to each other (deterministic rules, not a model's choice). */
export function NetworkView({ graph }: { graph: AgentGraph }) {
  const wide = useMediaQuery('(min-width: 768px)');
  const navigate = useNavigate();
  const name = new Map(graph.nodes.map((n) => [n.key, n.name]));

  if (!wide) {
    return (
      <ol className="flex flex-col items-stretch gap-2">
        {graph.nodes.map((n, i) => {
          const out = graph.edges.filter((e) => e.from === n.key);
          return (
            <li key={n.key} className="flex flex-col gap-2">
              <NodeCard
                node={n}
                onOpen={() => void navigate({ to: '/agents/$key', params: { key: n.key } })}
              />
              {out.map((e) => (
                <p key={e.to} className="flex items-center gap-2 pl-4 text-xs text-fg-secondary">
                  <ArrowDown className="size-4 text-fg-tertiary" strokeWidth={1.75} aria-hidden />
                  hands off to {name.get(e.to)} · {e.count7d} this week
                </p>
              ))}
              {i < graph.nodes.length - 1 && !out.length && <span className="h-1" aria-hidden />}
            </li>
          );
        })}
      </ol>
    );
  }

  const { pos, width, height } = layout(graph);
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`-8 -8 ${width + 16} ${height + 16}`}
        width={width + 16}
        height={height + 16}
        role="img"
        aria-label={`Agent network: ${graph.edges.map((e) => `${name.get(e.from)} hands off to ${name.get(e.to)}`).join('; ') || 'no hand-offs'}`}
        className="mx-auto block max-w-full"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-tertiary)" />
          </marker>
        </defs>
        {graph.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + W;
          const y1 = a.y + H / 2;
          const x2 = b.x - 4;
          const y2 = b.y + H / 2;
          const mid = (x1 + x2) / 2;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="var(--hairline-strong)"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
              <text
                x={mid}
                y={(y1 + y2) / 2 - 8}
                textAnchor="middle"
                fontSize={12}
                fill="var(--fg-secondary)"
              >
                {e.count7d} hand-off{e.count7d === 1 ? '' : 's'} this week
              </text>
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.key);
          if (!p) return null;
          return (
            <foreignObject key={n.key} x={p.x} y={p.y} width={W} height={H}>
              <NodeCard
                node={n}
                onOpen={() => void navigate({ to: '/agents/$key', params: { key: n.key } })}
              />
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

function NodeCard({ node: n, onOpen }: { node: AgentGraph['nodes'][number]; onOpen: () => void }) {
  const Icon = AGENT_ICONS[n.key];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-[72px] w-full items-center gap-3 rounded-lg border bg-surface px-3 text-left shadow-card transition-colors hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${n.running ? 'border-accent' : 'border-hairline'} ${n.isEnabled ? '' : 'opacity-60'}`}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text"
        aria-hidden
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{n.name}</span>
        <span className="mt-0.5 block">
          {n.running ? (
            <RunStatusPill status="RUNNING" />
          ) : n.isEnabled ? (
            n.lastStatus ? (
              <RunStatusPill status={n.lastStatus} />
            ) : (
              <span className="text-xs text-fg-tertiary">No runs this week</span>
            )
          ) : (
            <span className="text-xs text-fg-tertiary">Off</span>
          )}
        </span>
      </span>
    </button>
  );
}
