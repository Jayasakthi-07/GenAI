import { APP_NAME, APP_TITLE, APP_VERSION, healthSchema, systemInfoSchema } from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client';
import { DEMO_PASSWORD, USERS } from '../../demo/catalog';

export const systemRoutes: FastifyPluginAsyncZod<{ prisma: Db; demoMode: boolean }> = async (
  app,
  { prisma, demoMode },
) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness and database connectivity',
        response: { 200: healthSchema, 503: healthSchema },
      },
    },
    async (_request, reply) => {
      const database = await prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      );
      return reply.status(database === 'up' ? 200 : 503).send({
        status: database === 'up' ? ('ok' as const) : ('degraded' as const),
        database,
        version: APP_VERSION,
        time: new Date().toISOString(),
      });
    },
  );

  app.get(
    '/system/info',
    {
      schema: {
        tags: ['system'],
        summary: 'Application name, version and (in demo mode) the demo accounts',
        response: { 200: systemInfoSchema },
      },
    },
    async () => {
      let demo = null;
      if (demoMode) {
        // Only list demo accounts that still exist and are active.
        const existing = await prisma.user
          .findMany({
            where: { email: { in: USERS.map((u) => u.email) }, isActive: true },
            select: { email: true },
          })
          .catch(() => []);
        const emails = new Set(existing.map((u) => u.email));
        const accounts = USERS.filter((u) => emails.has(u.email)).map((u) => ({
          email: u.email,
          name: u.name,
          role: u.role,
        }));
        demo = accounts.length ? { password: DEMO_PASSWORD, accounts } : null;
      }
      return { name: APP_NAME, title: APP_TITLE, version: APP_VERSION, node: process.versions.node, demo };
    },
  );
};
