import { z } from 'zod';
import { ACTION_TYPES } from '../constants/agents';
import { modelRefSchema } from './ai';
import { actionDisplaySchema, actionImpactSchema, citationSchema } from './agents';

/** A change the Assistant drafted. Nothing happens until the user confirms it. */
export const confirmationCardSchema = z.object({
  id: z.uuid(),
  type: z.enum(ACTION_TYPES),
  title: z.string(),
  summary: z.string(),
  rationale: z.string(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  impact: actionImpactSchema,
  display: actionDisplaySchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'confirmed', 'dismissed', 'failed']),
  /** e.g. { entity: 'PurchaseOrder', id, number } once confirmed. */
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
});
export type ConfirmationCard = z.infer<typeof confirmationCardSchema>;

export const chatChartSchema = z.object({
  title: z.string(),
  type: z.enum(['bars', 'trend']),
  xKey: z.string(),
  series: z.array(z.object({ key: z.string(), label: z.string() })),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  /** How to format values. */
  unit: z.enum(['money', 'units']),
});
export type ChatChart = z.infer<typeof chatChartSchema>;

export const chatPartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tool'), name: z.string(), label: z.string(), ok: z.boolean() }),
  z.object({ kind: z.literal('chart'), chart: chatChartSchema }),
  z.object({ kind: z.literal('card'), card: confirmationCardSchema }),
]);
export type ChatPart = z.infer<typeof chatPartSchema>;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  parts: z.array(chatPartSchema),
  citations: z.array(citationSchema),
  modelUsed: z.string().nullable(),
  /** Assistant turns are recorded as agent runs. */
  runId: z.uuid().nullable(),
  /** No model was available: the answer is setup guidance, not AI. */
  ruleBased: z.boolean(),
  createdAt: z.string(),
});
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int(),
});
export type ConversationDto = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema.extend({ messages: z.array(chatMessageSchema) });
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Type a question').max(4000),
  model: modelRefSchema.optional(),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const renameConversationSchema = z.object({ title: z.string().trim().min(1).max(120) });

/** One line of the streamed (NDJSON) reply to a message. */
export type ChatStreamEvent =
  | { type: 'start'; runId: string | null; model: string | null; userMessageId: string }
  | { type: 'text'; delta: string }
  /** The model's text so far was a preamble before a tool call; the UI may collapse it. */
  | { type: 'reset' }
  | { type: 'tool'; name: string; label: string; status: 'running' | 'done' | 'error' }
  | { type: 'part'; part: ChatPart }
  | { type: 'done'; message: ChatMessageDto; conversation: ConversationDto }
  | { type: 'error'; message: string };
