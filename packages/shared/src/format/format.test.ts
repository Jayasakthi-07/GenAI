import { describe, expect, it } from 'vitest';
import { formatDays, formatMoney, formatNumber, formatPercent, formatQuantity } from './index';

describe('formatMoney', () => {
  it('uses Indian digit grouping and two decimals', () => {
    expect(formatMoney('1234567.5')).toBe('₹12,34,567.50');
    expect(formatMoney(0)).toBe('₹0.00');
  });

  it('formats decimal strings exactly, without float rounding', () => {
    // 0.1 + 0.2 style errors must never reach the screen.
    expect(formatMoney('10000000000000.07')).toBe('₹1,00,00,00,00,00,000.07');
  });

  it('drops paise for whole amounts when asked', () => {
    expect(formatMoney('2500', { compactDecimals: true })).toBe('₹2,500');
    expect(formatMoney('2500.5', { compactDecimals: true })).toBe('₹2,500.50');
  });

  it('uses lakh/crore compact notation', () => {
    expect(formatMoney(1_250_000, { compact: true })).toBe('₹12.5L');
    expect(formatMoney(31_000_000, { compact: true })).toBe('₹3.1Cr');
  });

  it('formats negatives', () => {
    expect(formatMoney('-450')).toBe('-₹450.00');
  });
});

describe('numbers, quantities, percents and days', () => {
  it('groups numbers the Indian way', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
    expect(formatQuantity(1500, 'pcs')).toBe('1,500 pcs');
  });

  it('formats fractions as percentages', () => {
    expect(formatPercent(0.1234)).toBe('12.3%');
    expect(formatPercent(0.05, { signed: true })).toBe('+5%');
    expect(formatPercent(-0.021, { signed: true })).toBe('-2.1%');
  });

  it('formats day counts', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(3.14)).toBe('3.1 days');
    expect(formatDays(42.6)).toBe('43 days');
    expect(formatDays(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
