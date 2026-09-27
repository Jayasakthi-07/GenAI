import { buildApp } from '../src/app';
import { parseEnv } from '../src/config/env';
import { createPrisma } from '../src/db/client';

export const TEST_ORIGIN = 'http://127.0.0.1:5173';

export async function createTestApp(databaseUrl: string) {
  const env = parseEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough-000',
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    LOG_LEVEL: 'silent',
  });
  const prisma = createPrisma(databaseUrl);
  const app = await buildApp({ env, prisma });
  await app.ready();
  return { app, prisma, env };
}

/** Removes every application row, keeping the schema (and migrations table). */
export async function resetDatabase(prisma: ReturnType<typeof createPrisma>) {
  const rows = await prisma.$queryRaw<Array<{ tables: string | null }>>`
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') AS tables
    FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows[0]?.tables;
  if (tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/** Pulls the signed session cookie out of a Set-Cookie header. */
export function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
  const match = /sr_session=([^;]+)/.exec(header);
  if (!match?.[1]) throw new Error('No session cookie was set');
  return `sr_session=${match[1]}`;
}
