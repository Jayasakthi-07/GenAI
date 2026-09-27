import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { can } from './actor';
import { redact } from './audit';

describe('redact', () => {
  it('replaces secrets at any depth and keeps everything else', () => {
    const result = redact({
      name: 'Groq',
      apiKey: 'gsk_live_123',
      settings: { rpm: 30, extraHeaders: { token: 'abc' } },
      users: [{ email: 'a@b.example', passwordHash: '$argon2id$…' }],
    });
    expect(result).toEqual({
      name: 'Groq',
      apiKey: '[redacted]',
      settings: { rpm: 30, extraHeaders: { token: '[redacted]' } },
      users: [{ email: 'a@b.example', passwordHash: '[redacted]' }],
    });
  });

  it('serializes dates, decimals and binary safely', () => {
    const at = new Date('2026-09-27T10:00:00Z');
    expect(redact({ at, cost: new Decimal('12.50'), blob: Buffer.from('secret') })).toEqual({
      at: '2026-09-27T10:00:00.000Z',
      cost: '12.5',
      blob: '[redacted]',
    });
  });
});

describe('actor permissions', () => {
  it('gives agents operational (manager) permissions but never admin ones', () => {
    const agent = { type: 'agent', agentKey: 'replenishment_planner', runId: null } as const;
    expect(can(agent, 'purchase_orders.create')).toBe(true);
    expect(can(agent, 'ai.configure')).toBe(false);
    expect(can(agent, 'users.manage')).toBe(false);
  });

  it('limits an agent acting for a user to that user’s role', () => {
    const agent = {
      type: 'agent',
      agentKey: 'assistant',
      runId: 'r1',
      onBehalfOf: { userId: 'u1', role: 'STAFF' },
    } as const;
    expect(can(agent, 'actions.approve')).toBe(false);
    expect(can(agent, 'stock.operate')).toBe(true);
  });
});
