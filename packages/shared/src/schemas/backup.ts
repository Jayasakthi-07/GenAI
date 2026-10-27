import { z } from 'zod';
import { AGENT_KEYS, AUTONOMIES } from '../constants/agents';
import { modelRefSchema, routingSchema } from './ai';
import { agentLimitsSchema, agentTriggersSchema } from './agents';
import { orgSettingsSchema } from './settings';

/**
 * A settings backup: organization settings, agent configuration and model routing. It never
 * contains API keys, users or inventory data.
 */
export const settingsBackupSchema = z.object({
  format: z.literal('stockroom.settings'),
  version: z.literal(1),
  exportedAt: z.string(),
  organization: z.object({
    name: z.string().trim().min(1).max(120),
    legalName: z.string().nullable(),
    gstin: z.string().nullable(),
    address: z.string().nullable(),
    settings: orgSettingsSchema,
  }),
  agents: z.array(
    z.object({
      key: z.enum(AGENT_KEYS),
      isEnabled: z.boolean(),
      autonomy: z.enum(AUTONOMIES),
      /** null = the built-in prompt. */
      systemPrompt: z.string().nullable(),
      triggers: agentTriggersSchema,
      limits: agentLimitsSchema,
      modelOverride: modelRefSchema.nullable(),
    }),
  ),
  routing: routingSchema,
});
export type SettingsBackup = z.infer<typeof settingsBackupSchema>;

export const settingsImportSchema = z.object({
  backup: settingsBackupSchema,
  /** false = only report what would change. */
  apply: z.boolean().default(false),
});
export type SettingsImport = z.input<typeof settingsImportSchema>;

export const settingsImportResultSchema = z.object({
  applied: z.boolean(),
  changes: z.array(
    z.object({
      section: z.enum(['organization', 'agents', 'routing']),
      item: z.string(),
      detail: z.string(),
    }),
  ),
  /** Models in the backup that no enabled provider offers right now. */
  warnings: z.array(z.string()),
});
export type SettingsImportResult = z.infer<typeof settingsImportResultSchema>;
