import { z } from 'zod';
import { ROLES } from '../constants/roles';

export const loginRequestSchema = z.object({
  // Normalize before validating, so pasted addresses with spaces or capitals still work.
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200, 'Use at most 200 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords don’t match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password you haven’t used here',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const themePreferenceSchema = z.enum(['light', 'dark', 'system']);
export const densityPreferenceSchema = z.enum(['comfortable', 'compact']);

export const NOTIFICATION_TYPES = ['alert', 'approval', 'run_failed', 'po_received', 'report_ready'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  alert: 'Urgent alerts',
  approval: 'Proposals waiting for approval',
  run_failed: 'Agent runs that fail',
  po_received: 'Goods received',
  report_ready: 'Briefings and reports',
};
export const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  alert: 'New critical and high-priority alerts.',
  approval: 'An agent proposes something only a manager or admin can approve.',
  run_failed: 'For people who manage agents.',
  po_received: 'A delivery is received against a purchase order.',
  report_ready: 'The Report Writer publishes a daily briefing or weekly summary.',
};

const channelSchema = z.object({ inApp: z.boolean(), toast: z.boolean() });
const channel = (inApp: boolean, toast: boolean) => channelSchema.default({ inApp, toast });
export const notificationPreferencesSchema = z.object({
  alert: channel(true, true),
  approval: channel(true, true),
  run_failed: channel(true, false),
  po_received: channel(true, false),
  report_ready: channel(true, true),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

const onboardingSchema = z.object({
  dismissed: z.boolean().default(false),
  reviewedAgents: z.boolean().default(false),
  ranAnalysis: z.boolean().default(false),
});

export const userPreferencesSchema = z.object({
  theme: themePreferenceSchema.default('system'),
  density: densityPreferenceSchema.default('comfortable'),
  sidebarCollapsed: z.boolean().default(false),
  notifications: notificationPreferencesSchema.default(notificationPreferencesSchema.parse({})),
  /** The first-run checklist on the dashboard. */
  onboarding: onboardingSchema.default(onboardingSchema.parse({})),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * A patch: only the keys sent change. (Zod 4 applies defaults inside `.partial()`, which would
 * reset every preference the patch leaves out, so this is spelled out without defaults.)
 */
export const updatePreferencesSchema = z.object({
  theme: themePreferenceSchema.optional(),
  density: densityPreferenceSchema.optional(),
  sidebarCollapsed: z.boolean().optional(),
  notifications: z.partialRecord(z.enum(NOTIFICATION_TYPES), channelSchema).optional(),
  onboarding: z
    .object({ dismissed: z.boolean(), reviewedAgents: z.boolean(), ranAnalysis: z.boolean() })
    .partial()
    .optional(),
});
export type UpdatePreferences = z.infer<typeof updatePreferencesSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  mustChangePassword: z.boolean(),
  preferences: userPreferencesSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  permissions: z.array(z.string()),
  organization: z.object({
    name: z.string(),
    currency: z.string(),
    locale: z.string(),
    timezone: z.string(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
