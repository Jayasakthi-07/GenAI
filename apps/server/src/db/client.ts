import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '#generated/prisma/client.ts';
import { AppError } from '../domain/errors';

export type Db = InstanceType<typeof PrismaClient>;

export function createPrisma(connectionString: string): Db {
  const adapter = new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter });
}

/** Turns low-level connection failures into an actionable message. */
export function describeDbError(error: unknown, connectionString: string): string {
  let where = 'the configured address';
  try {
    const url = new URL(connectionString);
    where = `${url.hostname}:${url.port || 5432} (database "${url.pathname.slice(1)}", user "${url.username}")`;
  } catch {
    // Keep the generic wording if the URL can't be parsed.
  }
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(message)) {
    return `Can't reach PostgreSQL at ${where} — is the service running? (PowerShell as admin: Start-Service postgresql-x64-18)`;
  }
  if (code === '28P01' || /password authentication failed/i.test(message)) {
    return `PostgreSQL rejected the password for ${where}. Check DATABASE_URL in .env.`;
  }
  if (code === '3D000' || /does not exist/i.test(message)) {
    return `The database at ${where} doesn't exist. Create it: CREATE DATABASE stockroom OWNER stockroom;`;
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return `Timed out connecting to PostgreSQL at ${where}.`;
  }
  return `Couldn't connect to PostgreSQL at ${where}: ${message}`;
}

export async function assertDatabaseReachable(prisma: Db, connectionString: string): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new AppError('DB_UNAVAILABLE', describeDbError(error, connectionString));
  }
}

/** Interactive transaction client type (what `prisma.$transaction(async (tx) => …)` receives). */
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];
