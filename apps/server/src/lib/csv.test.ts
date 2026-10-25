import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('parses quotes, escaped quotes, embedded commas and newlines', () => {
    const text = '﻿sku,name,description\r\nA-1,"Rice, 5 kg","Aged ""12 months""\nlong grain"\n\nB-2,Salt,\n';
    expect(parseCsv(text)).toEqual([
      ['sku', 'name', 'description'],
      ['A-1', 'Rice, 5 kg', 'Aged "12 months"\nlong grain'],
      ['B-2', 'Salt', ''],
    ]);
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['x,y', 'say "hi"'],
        [1, null],
      ],
    );
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['x,y', 'say "hi"'],
      ['1', ''],
    ]);
  });

  it('neutralises formulas but keeps negative numbers', () => {
    const csv = toCsv(['v'], [['=HYPERLINK("x")'], ['-12.5'], ['@cmd']]);
    const [, a, b, c] = parseCsv(csv);
    expect(a?.[0]).toBe('\'=HYPERLINK("x")');
    expect(b?.[0]).toBe('-12.5');
    expect(c?.[0]).toBe("'@cmd");
  });
});
