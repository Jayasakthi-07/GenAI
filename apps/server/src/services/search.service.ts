import { PO_STATUS_LABELS, SO_STATUS_LABELS, type SearchResult } from '@stockroom/shared';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import { money } from './support';

const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** Find any record by name, SKU, barcode or document number, for the command palette. */
export class SearchService {
  constructor(private readonly prisma: Db) {}

  async search(actor: Actor, q: string): Promise<SearchResult[]> {
    assertCan(actor, 'inventory.view');
    const upper = q.toUpperCase();
    const [products, suppliers, customers, pos, sos, transfers, counts] = await Promise.all([
      this.prisma.product.findMany({
        where: { OR: [{ name: ci(q) }, { sku: ci(q) }, { brand: ci(q) }, { barcode: q }] },
        select: { id: true, name: true, sku: true, category: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: 6,
      }),
      this.prisma.supplier.findMany({
        where: { OR: [{ name: ci(q) }, { code: ci(q) }] },
        select: { id: true, name: true, code: true, city: true },
        take: 4,
      }),
      this.prisma.customer.findMany({
        where: { OR: [{ name: ci(q) }, { code: ci(q) }] },
        select: { id: true, name: true, code: true, city: true },
        take: 4,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { number: ci(upper) },
        select: { id: true, number: true, status: true, total: true, supplier: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 4,
      }),
      this.prisma.salesOrder.findMany({
        where: { number: ci(upper) },
        select: { id: true, number: true, status: true, total: true, customer: { select: { name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 4,
      }),
      this.prisma.transfer.findMany({
        where: { number: ci(upper) },
        select: { id: true, number: true, status: true },
        take: 3,
      }),
      this.prisma.cycleCount.findMany({
        where: { number: ci(upper) },
        select: { id: true, number: true, status: true },
        take: 3,
      }),
    ]);
    return [
      ...products.map((p) => ({
        kind: 'product' as const,
        id: p.id,
        title: p.name,
        subtitle: `${p.sku} · ${p.category.name}`,
      })),
      ...suppliers.map((s) => ({
        kind: 'supplier' as const,
        id: s.id,
        title: s.name,
        subtitle: [s.code, s.city].filter(Boolean).join(' · '),
      })),
      ...customers.map((c) => ({
        kind: 'customer' as const,
        id: c.id,
        title: c.name,
        subtitle: [c.code, c.city].filter(Boolean).join(' · '),
      })),
      ...pos.map((p) => ({
        kind: 'purchase_order' as const,
        id: p.id,
        title: p.number,
        subtitle: `${p.supplier.name} · ${PO_STATUS_LABELS[p.status]} · ₹${money(p.total)}`,
      })),
      ...sos.map((s) => ({
        kind: 'sales_order' as const,
        id: s.id,
        title: s.number,
        subtitle: `${s.customer?.name ?? 'Walk-in'} · ${SO_STATUS_LABELS[s.status]} · ₹${money(s.total)}`,
      })),
      ...transfers.map((t) => ({
        kind: 'transfer' as const,
        id: t.id,
        title: t.number,
        subtitle: `Transfer · ${t.status.toLowerCase().replace('_', ' ')}`,
      })),
      ...counts.map((c) => ({
        kind: 'cycle_count' as const,
        id: c.id,
        title: c.number,
        subtitle: `Cycle count · ${c.status.toLowerCase().replace('_', ' ')}`,
      })),
    ];
  }
}
