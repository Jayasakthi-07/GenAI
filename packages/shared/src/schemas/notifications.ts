import { z } from 'zod';
import { SEVERITIES } from '../constants/inventory';
import { NOTIFICATION_TYPES } from './auth';

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  severity: z.enum(SEVERITIES).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  data: z.array(notificationSchema),
  unread: z.number().int(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const notificationsQuerySchema = z.object({
  unread: z.preprocess((v) => v === '1' || v === 'true', z.boolean()).default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const markReadSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);
export type MarkRead = z.infer<typeof markReadSchema>;
