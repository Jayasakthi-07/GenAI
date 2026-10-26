import { z } from 'zod';
import { AGENT_KEYS } from '../constants/agents';
import { paginationQuerySchema } from './common';

export const REPORT_TYPES = ['DAILY_BRIEFING', 'WEEKLY_SUMMARY'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY_BRIEFING: 'Daily briefing',
  WEEKLY_SUMMARY: 'Weekly summary',
};

export const reportKpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Formatted for display (₹12.4L, 96%, 14). */
  value: z.string(),
  /** "+4.2% vs previous" or null. */
  change: z.string().nullable(),
  /** Whether the change is good news, bad news or neither. */
  tone: z.enum(['good', 'bad', 'neutral']),
});

export const reportContentSchema = z.object({
  kpis: z.array(reportKpiSchema),
  /** What happened in the period, one fact per line. */
  changes: z.array(z.string()),
  risks: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      link: z.string().nullable(),
    }),
  ),
  agentActivity: z.array(
    z.object({
      agentKey: z.enum(AGENT_KEYS),
      agent: z.string(),
      runs: z.number().int(),
      aiRuns: z.number().int(),
      proposals: z.number().int(),
      executed: z.number().int(),
      rejected: z.number().int(),
    }),
  ),
  pendingDecisions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      agent: z.string(),
      summary: z.string(),
      createdAt: z.string(),
    }),
  ),
  /** Paragraphs separated by blank lines; a "- " line is a bullet. */
  narrative: z.string(),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

export const reportListItemSchema = z.object({
  id: z.uuid(),
  type: z.enum(REPORT_TYPES),
  title: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  narrativeSource: z.enum(['AI', 'RULE']),
  modelUsed: z.string().nullable(),
  runId: z.uuid().nullable(),
  createdAt: z.string(),
  /** First sentence of the narrative. */
  excerpt: z.string(),
});
export type ReportListItem = z.infer<typeof reportListItemSchema>;

export const reportSchema = reportListItemSchema.extend({ content: reportContentSchema });
export type ReportDto = z.infer<typeof reportSchema>;

export const reportsQuerySchema = paginationQuerySchema.extend({ type: z.enum(REPORT_TYPES).optional() });
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
