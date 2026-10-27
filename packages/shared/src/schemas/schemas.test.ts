import { describe, expect, it } from 'vitest';
import { PERMISSIONS, roleCan } from '../constants/roles';
import { changePasswordRequestSchema, loginRequestSchema } from './auth';
import { moneySchema } from './common';

describe('roles', () => {
  it('gives admins every permission', () => {
    for (const p of PERMISSIONS) expect(roleCan('ADMIN', p)).toBe(true);
  });

  it('keeps AI keys, users and organization settings admin-only', () => {
    for (const p of ['ai.configure', 'users.manage', 'organization.manage', 'demo.reset'] as const) {
      expect(roleCan('MANAGER', p)).toBe(false);
      expect(roleCan('STAFF', p)).toBe(false);
    }
  });

  it('lets managers approve but not staff', () => {
    expect(roleCan('MANAGER', 'actions.approve')).toBe(true);
    expect(roleCan('MANAGER', 'purchase_orders.approve')).toBe(true);
    expect(roleCan('STAFF', 'actions.approve')).toBe(false);
    expect(roleCan('STAFF', 'purchase_orders.approve')).toBe(false);
    expect(roleCan('STAFF', 'stock.operate')).toBe(true);
  });
});

describe('auth schemas', () => {
  it('normalizes the login email', () => {
    expect(loginRequestSchema.parse({ email: '  Jayasakthi@Kaveri.Example ', password: 'x' }).email).toBe(
      'jayasakthi@kaveri.example',
    );
  });

  it('enforces password rules and matching confirmation', () => {
    const base = { currentPassword: 'old-password-1' };
    expect(
      changePasswordRequestSchema.safeParse({ ...base, newPassword: 'short1', confirmPassword: 'short1' })
        .success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({
        ...base,
        newPassword: 'onlyletterszz',
        confirmPassword: 'onlyletterszz',
      }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({
        ...base,
        newPassword: 'good-password-2',
        confirmPassword: 'different-2',
      }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({
        ...base,
        newPassword: 'old-password-1',
        confirmPassword: 'old-password-1',
      }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({
        ...base,
        newPassword: 'good-password-2',
        confirmPassword: 'good-password-2',
      }).success,
    ).toBe(true);
  });
});

describe('money schema', () => {
  it('accepts decimal strings with up to two places', () => {
    expect(moneySchema.safeParse('1250').success).toBe(true);
    expect(moneySchema.safeParse('1250.5').success).toBe(true);
    expect(moneySchema.safeParse('1250.555').success).toBe(false);
    expect(moneySchema.safeParse('12,50').success).toBe(false);
  });
});
