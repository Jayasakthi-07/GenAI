import { z } from 'zod';
import { ROLES } from '../constants/roles';

export const systemInfoSchema = z.object({
  name: z.string(),
  title: z.string(),
  version: z.string(),
  node: z.string(),
  /** DEMO_MODE: the simulator and demo reset are available. */
  demoMode: z.boolean(),
  /** Present when demo mode is on: the seeded accounts, shown on the sign-in screen for presentations. */
  demo: z
    .object({
      password: z.string(),
      accounts: z.array(z.object({ email: z.string(), name: z.string(), role: z.enum(ROLES) })),
    })
    .nullable(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
  version: z.string(),
  time: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
