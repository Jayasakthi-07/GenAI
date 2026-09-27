import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://stockroom:secret@127.0.0.1:5432/stockroom',
  COOKIE_SECRET: 'x'.repeat(40),
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

function problems(env: Record<string, string>): string[] {
  try {
    parseEnv(env);
    return [];
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
}

describe('parseEnv', () => {
  it('applies local-only defaults', () => {
    const env = parseEnv(valid);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.API_PORT).toBe(4000);
    expect(env.DEMO_MODE).toBe(true);
    expect(env.allowedOrigins).toContain('http://127.0.0.1:5173');
    expect(env.allowedOrigins).toContain('http://localhost:4000');
  });

  it('explains how to fix a missing or placeholder database URL', () => {
    expect(problems({ ...valid, DATABASE_URL: '' }).join()).toMatch(/postgresql/);
    expect(
      problems({
        ...valid,
        DATABASE_URL: 'postgresql://stockroom:CHANGE_ME@127.0.0.1:5432/stockroom',
      }).join(),
    ).toMatch(/CHANGE_ME/);
  });

  it('refuses to listen beyond this computer', () => {
    expect(problems({ ...valid, HOST: '0.0.0.0' }).join()).toMatch(/only listens on this computer/);
  });

  it('validates generated secrets', () => {
    expect(problems({ ...valid, COOKIE_SECRET: 'short' }).join()).toMatch(/pnpm bootstrap/);
    expect(problems({ ...valid, APP_ENCRYPTION_KEY: 'not-32-bytes' }).join()).toMatch(/32 random bytes/);
  });

  it('adds extra allowed origins without trailing slashes', () => {
    const env = parseEnv({ ...valid, APP_ORIGINS: 'http://127.0.0.1:8080/, http://stockroom.localhost' });
    expect(env.allowedOrigins).toContain('http://127.0.0.1:8080');
    expect(env.allowedOrigins).toContain('http://stockroom.localhost');
  });
});
