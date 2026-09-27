import type { ApiError, MeResponse } from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { hashPassword } from '../src/services/password';
import { createTestApp, resetDatabase, sessionCookie, TEST_ORIGIN } from './helpers';

const url = inject('testDbUrl');

describe.skipIf(!url)('auth and API envelope (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    await ctx.prisma.organization.create({ data: { name: 'Test Traders' } });
    await ctx.prisma.user.createMany({
      data: [
        {
          email: 'manager@test.example',
          name: 'Test Manager',
          role: 'MANAGER',
          passwordHash: await hashPassword('manager-pass-1'),
        },
        {
          email: 'gone@test.example',
          name: 'Gone User',
          role: 'STAFF',
          isActive: false,
          passwordHash: await hashPassword('gone-pass-1'),
        },
      ],
    });
  });

  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  const login = (email: string, password: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: TEST_ORIGIN },
      payload: { email, password },
    });

  it('signs in, sets an httpOnly SameSite cookie, and never returns the password hash', async () => {
    const res = await login('Manager@Test.Example', 'manager-pass-1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { email: 'manager@test.example', role: 'MANAGER' } });
    expect(res.body).not.toContain('argon2');
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const wrong = await login('manager@test.example', 'nope-nope-1');
    const unknown = await login('nobody@test.example', 'nope-nope-1');
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' },
    });
    expect(unknown.json()).toEqual(wrong.json());
  });

  it('tells a deactivated user why they cannot sign in (only with the right password)', async () => {
    const res = await login('gone@test.example', 'gone-pass-1');
    expect(res.statusCode).toBe(401);
    expect(res.json<ApiError>().error.message).toMatch(/deactivated/);
  });

  it('returns field errors in the standard envelope', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ApiError>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect((body.error.details as { fields: Record<string, string> }).fields).toHaveProperty('email');
  });

  it('resolves the session, reports permissions, and signs out', async () => {
    const cookie = sessionCookie(
      (await login('manager@test.example', 'manager-pass-1')).headers['set-cookie'],
    );
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const body = me.json<MeResponse>();
    expect(body.permissions).toContain('actions.approve');
    expect(body.permissions).not.toContain('ai.configure');
    expect(body.organization.name).toBe('Test Traders');

    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie, origin: TEST_ORIGIN },
    });
    expect(out.statusCode).toBe(200);
    const after = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects state-changing requests from other origins (CSRF)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'manager@test.example', password: 'manager-pass-1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('changes the password and signs out other sessions', async () => {
    const first = sessionCookie(
      (await login('manager@test.example', 'manager-pass-1')).headers['set-cookie'],
    );
    const second = sessionCookie(
      (await login('manager@test.example', 'manager-pass-1')).headers['set-cookie'],
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { cookie: first, origin: TEST_ORIGIN },
      payload: {
        currentPassword: 'manager-pass-1',
        newPassword: 'manager-pass-2',
        confirmPassword: 'manager-pass-2',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: first } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: second } }))
        .statusCode,
    ).toBe(401);
    expect((await login('manager@test.example', 'manager-pass-2')).statusCode).toBe(200);

    const audit = await ctx.prisma.auditLog.findMany({ where: { action: 'auth.change_password' } });
    expect(audit).toHaveLength(1);
  });

  it('rate-limits repeated sign-in attempts', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await login('manager@test.example', 'wrong-pass-9')).statusCode;
    expect(last).toBe(429);
  });

  it('answers unknown routes and anonymous requests with the envelope', async () => {
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ApiError>().error.code).toBe('NOT_FOUND');
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/v1/dashboard/overview' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json<ApiError>().error.code).toBe('UNAUTHENTICATED');
  });
});
