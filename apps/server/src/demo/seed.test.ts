import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SUPPLIERS, USERS, WAREHOUSES } from './catalog';
import * as plants from './plants';
import { buildDemoData, verifyDemoData } from './seed';

// A fixed "today" keeps the test independent of when it runs.
const NOW = new Date('2026-09-27T12:00:00+05:30');
const data = buildDemoData(20260927, NOW);

function fingerprint(d: ReturnType<typeof buildDemoData>) {
  const h = createHash('sha256');
  for (const m of d.sim.movements)
    h.update(`${m.productId}|${m.warehouseId}|${m.type}|${m.quantity}|${m.occurredAt.toISOString()}\n`);
  for (const s of d.sim.stockLevels) h.update(`${s.productId}|${s.onHand}|${s.avgCost}\n`);
  return h.digest('hex');
}

describe('demo dataset', () => {
  it('satisfies every ledger, batch and purchase-order invariant', () => {
    expect(verifyDemoData(data)).toEqual([]);
  });

  it('is deterministic for a seed and date', () => {
    expect(fingerprint(buildDemoData(20260927, NOW))).toBe(fingerprint(data));
  });

  it('is a Tamil Nadu business run by four people', () => {
    expect(USERS.map((u) => [u.name, u.role])).toEqual([
      ['Jayasakthi', 'ADMIN'],
      ['Mehavardhini', 'ADMIN'],
      ['Shaheer', 'MANAGER'],
      ['Sameer', 'STAFF'],
    ]);
    expect(WAREHOUSES.map((w) => w.city)).toEqual(['Chennai', 'Coimbatore', 'Madurai']);
    // GSTIN state code 33 is Tamil Nadu.
    expect(SUPPLIERS.every((s) => s.gstin.startsWith('33'))).toBe(true);
    expect(data.customers.length).toBeGreaterThanOrEqual(200);
    expect(new Set(data.customers.map((c) => c.name)).size).toBe(data.customers.length);
    expect(
      data.customers.filter((c) => c.gstin).every((c) => /^33[A-Z]{5}\d{4}[A-Z]1Z\d$/.test(c.gstin ?? '')),
    ).toBe(true);
  });

  it('has the promised shape: ~200 products, 3 warehouses, ~12 suppliers, ~18 months of sales', () => {
    expect(data.products.length).toBeGreaterThanOrEqual(190);
    expect(new Set(data.sim.stockLevels.map((s) => s.warehouseId)).size).toBe(3);
    expect(new Set(data.products.flatMap((p) => p.suppliers.map((s) => s.supplier.code))).size).toBe(12);
    const days = new Set(data.sim.salesDaily.map((d) => d.date));
    expect(days.size).toBeGreaterThanOrEqual(540);
    expect(data.products.filter((p) => p.trackExpiry).length).toBeGreaterThan(20);
  });

  it('plants situations for the agents to find', () => {
    const levels = new Map(data.sim.stockLevels.map((s) => [`${s.productId}|${s.warehouseId}`, s]));
    const whId = (code: string) => data.ids.warehouses.get(code);
    const level = (key: string, wh: string) => levels.get(`${data.ids.products.get(key)}|${whId(wh)}`);

    // Deliberately low or out-of-stock items end at or below their reorder point.
    for (const p of plants.LOW_STOCK) {
      const s = level(p.key, p.wh);
      expect(s, p.key).toBeDefined();
      expect(s?.onHand ?? Infinity, `${p.key}@${p.wh}`).toBeLessThanOrEqual(s?.reorderPoint ?? 0);
    }
    // Overdue POs: sent, expected in the past, not received.
    const overdue = data.sim.purchaseOrders.filter(
      (po) => po.status === 'SENT' && po.expectedDate < data.today,
    );
    expect(overdue.length).toBeGreaterThanOrEqual(2);
    // A partially received PO with an invoice above the PO price.
    expect(data.sim.purchaseOrders.some((po) => po.status === 'PARTIALLY_RECEIVED')).toBe(true);
    // Batches expiring within the warning window.
    const soon = data.sim.batches.filter(
      (b) => b.quantity > 0 && b.expiryDate >= data.today && b.expiryDate <= '2026-10-10',
    );
    expect(soon.length).toBeGreaterThanOrEqual(plants.EXPIRING.length);
    // Open documents for the UI: draft and pending-approval POs, confirmed sales orders, a transfer in transit.
    expect(data.sim.purchaseOrders.some((po) => po.status === 'DRAFT')).toBe(true);
    expect(data.sim.purchaseOrders.some((po) => po.status === 'PENDING_APPROVAL')).toBe(true);
    expect(data.sim.salesOrders.some((so) => so.status === 'CONFIRMED')).toBe(true);
    expect(data.sim.transfers.some((t) => t.status === 'IN_TRANSIT')).toBe(true);
  });
});
