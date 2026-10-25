import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  at: string;
  label: string;
  by?: string | null;
  tone?: 'success' | 'danger' | 'accent' | 'neutral';
}

/** Vertical list of what happened to a record, oldest first. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative flex flex-col gap-4 pl-5">
      <span className="absolute top-1.5 bottom-1.5 left-[5px] w-px bg-hairline" aria-hidden />
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative">
          <span
            className={cn(
              'absolute top-1.5 -left-5 size-[11px] rounded-full border-2 border-surface',
              e.tone === 'success'
                ? 'bg-success'
                : e.tone === 'danger'
                  ? 'bg-danger'
                  : e.tone === 'accent'
                    ? 'bg-accent'
                    : 'bg-fg-tertiary',
            )}
            aria-hidden
          />
          <p className="text-sm font-medium">{e.label}</p>
          <p className="text-xs text-fg-tertiary">
            {dateTime(e.at)}
            {e.by ? ` · ${e.by}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
