import type { Env } from '../config/env';
import type { Db } from '../db/client';
import type { EventBus } from '../domain/events';
import { AuthService } from './auth.service';
import { DashboardService } from './dashboard.service';
import { UserService } from './user.service';

export interface ServiceDeps {
  prisma: Db;
  bus: EventBus;
  env: Env;
}

/** Composition root for domain services. Routes and agent tools both use these instances. */
export function createServices({ prisma, bus, env }: ServiceDeps) {
  return {
    auth: new AuthService(prisma, bus, env.SESSION_TTL_HOURS),
    users: new UserService(prisma),
    dashboard: new DashboardService(prisma),
  };
}

export type Services = ReturnType<typeof createServices>;
