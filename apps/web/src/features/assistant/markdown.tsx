import { Link } from '@tanstack/react-router';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small Markdown renderer for Assistant answers: paragraphs, headings, bullet and numbered
 * lists, tables, code, **bold**, *italic*, `code` and in-app links. It builds React elements
 * (never HTML strings), so model output can't inject markup.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn('flex flex-col gap-3 text-sm leading-relaxed', className)}>{blocks(text)}</div>;
}

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**'))
      out.push(
        <strong key={k} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    else if (tok.startsWith('`'))
      out.push(
        <code key={k} className="rounded bg-neutral-soft px-1 py-0.5 font-mono text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith('[')) {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok) ?? [];
      out.push(
        href.startsWith('/') ? (
          <Link key={k} to={href} className="font-medium text-accent-text hover:underline">
            {label}
          </Link>
        ) : (
          <span key={k}>{label}</span>
        ),
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
const numeric = (s: string) => /^[₹+\-−]?[\d,.]+\s*(%|d|days|units)?$/.test(s.replace(/\*\*/g, ''));

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const key = `b${n++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) body.push(lines[i++] ?? '');
      i++;
      out.push(
        <pre key={key} className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs">
          {body.join('\n')}
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(
        <p key={key} className="pt-1 text-sm font-semibold tracking-tight">
          {inline((heading[2] ?? '').replace(/\*\*/g, ''), key)}
        </p>,
      );
      i++;
      continue;
    }
    if (isTableRow(line) && isSeparator(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i] ?? '')) rows.push(cells(lines[i++] ?? ''));
      const right = head.map((_, c) => rows.length > 0 && rows.every((r) => !r[c] || numeric(r[c] ?? '')));
      out.push(
        <div key={key} className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2">
                {head.map((h, c) => (
                  <th
                    key={c}
                    className={cn(
                      'border-b border-hairline px-3 py-2 text-left text-xs font-medium text-fg-secondary',
                      right[c] && 'text-right',
                    )}
                  >
                    {inline(h, `${key}h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="[&:last-child_td]:border-b-0">
                  {head.map((_, c) => (
                    <td
                      key={c}
                      className={cn(
                        'border-b border-hairline px-3 py-2 align-top',
                        right[c] && 'text-right tabular',
                      )}
                    >
                      {inline(r[c] ?? '', `${key}r${ri}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i] ?? ''))
        items.push((lines[i++] ?? '').replace(bullet, ''));
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={key} className={cn('flex flex-col gap-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((it, j) => (
            <li key={j} className="pl-0.5 marker:text-fg-tertiary">
              {inline(it, `${key}i${j}`)}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !bullet.test(lines[i] ?? '') &&
      !/^#{1,4}\s/.test(lines[i] ?? '') &&
      !(isTableRow(lines[i] ?? '') && isSeparator(lines[i + 1] ?? '')) &&
      !(lines[i] ?? '').trim().startsWith('```')
    )
      para.push(lines[i++] ?? '');
    out.push(
      <p key={key}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `${key}p${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}
