import { SEVERITIES } from '@stockroom/shared';
import { z } from 'zod';

/** Lenient where small models drift (case, key names, plain strings, length), strict where it matters. */
const severity = z
  .preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(SEVERITIES))
  .optional()
  .catch(undefined);

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s));

export const findingSchema = z.preprocess(
  (v) => {
    if (typeof v === 'string') return { title: v };
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return {
        ...o,
        title: o.title ?? o.name ?? o.finding ?? o.issue ?? o.headline ?? o.summary,
        detail: o.detail ?? o.details ?? o.description ?? o.explanation ?? o.text ?? '',
      };
    }
    return v;
  },
  z.object({
    title: clipped(200).pipe(z.string().min(1)),
    detail: clipped(1200).default(''),
    severity,
  }),
);

export const baseOutput = z.object({
  summary: clipped(2000).pipe(z.string().min(1)),
  findings: z.array(findingSchema).max(20).default([]),
});
