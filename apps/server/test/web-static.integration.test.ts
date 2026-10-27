import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app';
import { findRepoRoot, parseEnv } from '../src/config/env';
import { createPrisma } from '../src/db/client';

const url = inject('testDbUrl');
const dist = resolve(findRepoRoot(), 'apps/web/dist');
const built = existsSync(resolve(dist, 'index.html'));

/** The production server serving the built app (`pnpm build && pnpm start`). */
describe.skipIf(!url || !built)('Serving the built web app (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let prisma: ReturnType<typeof createPrisma>;
  const lateFile = resolve(dist, 'assets', `late-${Date.now()}.js`);

  beforeAll(async () => {
    const env = parseEnv({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url,
      COOKIE_SECRET: 'test-cookie-secret-that-is-long-enough-000',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      LOG_LEVEL: 'silent',
    });
    prisma = createPrisma(url);
    app = await buildApp({ env, prisma, serveWeb: true });
    await app.ready();
  });
  afterAll(async () => {
    rmSync(lateFile, { force: true });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('serves the page for the root and for deep links, uncached', async () => {
    for (const path of ['/', '/products/0196b0f0-0000-7000-8000-000000000000', '/settings/ai']) {
      const res = await app.inject({ method: 'GET', url: path });
      expect(res.statusCode, path).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves hashed assets for good and 404s missing ones instead of the page', async () => {
    const asset = readdirSync(resolve(dist, 'assets')).find((f) => f.endsWith('.js'))!;
    const ok = await app.inject({ method: 'GET', url: `/assets/${asset}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toContain('immutable');

    const missing = await app.inject({ method: 'GET', url: '/assets/index-OLDBUILD.js' });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['content-type']).not.toContain('text/html');
  });

  it('serves files written after startup (a rebuild while running)', async () => {
    writeFileSync(lateFile, 'export const late = true;\n');
    const res = await app.inject({ method: 'GET', url: `/assets/${lateFile.split(/[\\/]/).pop()}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('late = true');
  });

  it('keeps API 404s as JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
