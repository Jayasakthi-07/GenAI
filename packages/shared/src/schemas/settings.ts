import { z } from 'zod';
import { ROLES } from '../constants/roles';
import { passwordSchema } from './auth';

/* ── Users ─────────────────────────────────────────────────────────────── */
export const userListItemSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  name: z.string().trim().min(1, 'Required').max(80),
  role: z.enum(ROLES),
  /** Temporary password; the user is asked to change it at first sign-in. */
  password: passwordSchema,
});
export type UserCreate = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  role: z.enum(ROLES),
  isActive: z.boolean(),
});
export type UserUpdate = z.input<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });

/* ── Organization ──────────────────────────────────────────────────────── */
export const orgSettingsSchema = z.object({
  /** Target probability of not running out during the lead time (drives safety stock). */
  serviceLevel: z.coerce.number().min(0.5).max(0.999),
  /** Cost of placing one purchase order, for EOQ. */
  orderCostInr: z.coerce.number().min(0).max(100_000),
  /** Annual holding cost as a fraction of unit cost, for EOQ. */
  holdingRate: z.coerce.number().min(0.01).max(1),
  expiryWarningDays: z.coerce.number().int().min(1).max(180),
  overstockDays: z.coerce.number().int().min(30).max(730),
  deadStockDays: z.coerce.number().int().min(30).max(730),
  alertDedupeHours: z.coerce.number().int().min(1).max(720),
  largeAdjustmentUnits: z.coerce.number().int().min(1).max(100_000),
  poApprovalThresholdInr: z.coerce.number().min(0).max(100_000_000),
  /** Daily briefing time, HH:mm in the organization's timezone. */
  briefingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 08:00'),
  /** Monthly purchasing budget the Replenishment Planner fills up to. */
  replenishmentBudgetInr: z.coerce.number().min(0).max(1_000_000_000),
});
export type OrgSettingsDto = z.infer<typeof orgSettingsSchema>;

export const organizationSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  gstin: z.string().nullable(),
  address: z.string().nullable(),
  currency: z.string(),
  locale: z.string(),
  timezone: z.string(),
  settings: orgSettingsSchema,
});
export type OrganizationDto = z.infer<typeof organizationSchema>;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  legalName: optional(160),
  gstin: z
    .union([
      z
        .string()
        .trim()
        .regex(/^[0-9A-Z]{15}$/, 'GSTIN has 15 letters and digits'),
      z.literal(''),
    ])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  address: optional(300),
  settings: orgSettingsSchema,
});
export type OrganizationUpdate = z.input<typeof organizationUpdateSchema>;
