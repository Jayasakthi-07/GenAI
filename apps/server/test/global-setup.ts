import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { loadRootEnv } from '../src/config/env';

/**
 * Prepares the integration-test database (TEST_DATABASE_URL): creates it if needed and applies
 * migrations. When no database is configured, integration tests skip themselves and unit tests
 * still run.
 */
export default async function setup(project: TestProject) {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url.includes('CHANGE_ME')) {
    project.provide('testDbUrl', '');
    return;
  }

  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '')}"`);
  } catch (error) {
    console.warn(`\n  Integration tests skipped: can't prepare ${dbName} (${(error as Error).message})\n`);
    project.provide('testDbUrl', '');
    return;
  } finally {
    await client.end().catch(() => {});
  }

  // Run the Prisma CLI through Node directly: no shell, same on every OS.
  const prismaCli = resolve(import.meta.dirname, '../node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  project.provide('testDbUrl', url);
}

declare module 'vitest' {
  export interface ProvidedContext {
    /** Empty when no test database is available (integration tests skip). */
    testDbUrl: string;
  }
}
