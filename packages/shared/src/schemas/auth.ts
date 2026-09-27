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

export const userPreferencesSchema = z.object({
  theme: themePreferenceSchema.default('system'),
  density: densityPreferenceSchema.default('comfortable'),
  sidebarCollapsed: z.boolean().default(false),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updatePreferencesSchema = userPreferencesSchema.partial();
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
