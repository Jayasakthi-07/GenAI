import { describe, expect, it } from 'vitest';
import { anchorsOf, isGrounded } from './grounding';

const facts = {
  counts: { critical: 18, high: 41 },
  items: [
    {
      product: 'Ponni Rice 5 kg',
      sku: 'STP-RIC-001',
      warehouse: 'CHN',
      daysOfCover: 0.42,
      severity: 'CRITICAL',
    },
    { product: 'Toned Milk 1 L', sku: 'DRY-MLK-001', warehouse: 'CBE', daysOfCover: 3.14159, state: 'LOW' },
  ],
  revenue: 1247956.53,
};
const anchors = anchorsOf(facts);

describe('isGrounded', () => {
  it('accepts text that names an item or warehouse from the facts', () => {
    expect(isGrounded('Ponni Rice 5 kg is nearly out.', anchors)).toBe(true);
    // Long names are often shortened to their first two words.
    expect(isGrounded('Ponni Rice is nearly out.', anchors)).toBe(true);
    expect(isGrounded('Rice is nearly out in the south.', anchors)).toBe(false);
    expect(isGrounded('Stockouts at CHN need attention.', anchors)).toBe(true);
  });

  it('accepts text that quotes a figure, including rounded and percentage forms', () => {
    expect(isGrounded('18 critical alerts are open.', anchors)).toBe(true);
    expect(isGrounded('Cover is down to 3.1 days.', anchors)).toBe(true);
    expect(isGrounded('Only 42% of a day of cover is left.', anchors)).toBe(true);
    expect(isGrounded('Revenue reached 12,47,956.53.', anchors)).toBe(true);
  });

  it('rejects fluent text about nothing in the analysis', () => {
    expect(
      isGrounded(
        'The system is experiencing critical issues with multiple components failing simultaneously, leading to a high risk of instability.',
        anchors,
      ),
    ).toBe(false);
    // Enum values and tiny numbers don't count as anchors.
    expect(isGrounded('Some items are low; 2 warehouses are affected.', anchors)).toBe(false);
  });
});
