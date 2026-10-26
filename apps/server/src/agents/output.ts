import { SEVERITIES } from '@stockroom/shared';
import { z } from 'zod';

/** Lenient where small models drift (case, missing optional parts), strict where it matters. */
const severity = z
  .preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(SEVERITIES))
  .optional()
  .catch(undefined);

export const findingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(1200).default(''),
  severity,
});

export const baseOutput = z.object({
  summary: z.string().trim().min(1).max(2000),
  findings: z.array(findingSchema).max(20).default([]),
});
