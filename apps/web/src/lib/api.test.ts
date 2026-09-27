import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthenticatedHandler } from './api';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthenticatedHandler(() => {});
});

describe('api client', () => {
  it('builds /api/v1 URLs and drops empty query values', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await api.get('/dashboard/overview', { days: 90, q: '', warehouse: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/dashboard/overview?days=90',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('turns the error envelope into an ApiError with field messages', async () => {
    mockFetch(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields need attention.',
        details: { fields: { email: 'Enter a valid email address' } },
      },
    });
    const error = await api.post('/auth/login', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_ERROR');
    expect((error as ApiError).fields).toEqual({ email: 'Enter a valid email address' });
  });

  it('sends the user to sign in on a 401 outside the auth endpoints', async () => {
    const onUnauthenticated = vi.fn();
    setUnauthenticatedHandler(onUnauthenticated);
    mockFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
    await api.get('/dashboard/overview').catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);

    mockFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' } });
    await api.post('/auth/login', {}).catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable server clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = await api.get('/health').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
    expect((error as ApiError).message).toMatch(/server/);
  });
});
