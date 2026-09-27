import type { Db } from '../db/client';

export interface LedgerCheckResult {
  name: string;
  description: string;
  violations: number;
  examples: unknown[];
}

const CHECKS: Array<{ name: string; description: string; sql: string }> = [
  {
    name: 'balance-equals-ledger',
    description: 'Every stock level equals the sum of its ledger movements',
    sql: `
      SELECT sl.product_id, sl.warehouse_id, sl.on_hand, COALESCE(m.total, 0) AS ledger
      FROM stock_levels sl
      LEFT JOIN (
        SELECT product_id, warehouse_id, SUM(quantity) AS total FROM stock_movements GROUP BY 1, 2
      ) m ON m.product_id = sl.product_id AND m.warehouse_id = sl.warehouse_id
      WHERE sl.on_hand <> COALESCE(m.total, 0)`,
  },
  {
    name: 'ledger-without-level',
    description: 'Every product × warehouse in the ledger has a stock level row',
    sql: `
      SELECT DISTINCT m.product_id, m.warehouse_id
      FROM stock_movements m
      LEFT JOIN stock_levels sl ON sl.product_id = m.product_id AND sl.warehouse_id = m.warehouse_id
      WHERE sl.id IS NULL`,
  },
  {
    name: 'latest-balance-after',
    description: 'The latest movement’s balance-after equals the current balance',
    sql: `
      SELECT sl.product_id, sl.warehouse_id, sl.on_hand, last.balance_after
      FROM stock_levels sl
      JOIN LATERAL (
        SELECT balance_after FROM stock_movements m
        WHERE m.product_id = sl.product_id AND m.warehouse_id = sl.warehouse_id
        ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 1
      ) last ON true
      WHERE last.balance_after <> sl.on_hand`,
  },
  {
    name: 'batches-equal-balance',
    description: 'For expiry-tracked products, batch quantities add up to the balance',
    sql: `
      SELECT sl.product_id, sl.warehouse_id, sl.on_hand, COALESCE(b.total, 0) AS batches
      FROM stock_levels sl
      JOIN products p ON p.id = sl.product_id AND p.track_expiry
      LEFT JOIN (SELECT product_id, warehouse_id, SUM(quantity) AS total FROM batches GROUP BY 1, 2) b
        ON b.product_id = sl.product_id AND b.warehouse_id = sl.warehouse_id
      WHERE sl.on_hand <> COALESCE(b.total, 0)`,
  },
  {
    name: 'sales-rollup',
    description: 'The daily sales rollup matches the SALE movements',
    sql: `
      WITH o AS (SELECT timezone FROM organizations LIMIT 1),
      ledger AS (
        SELECT m.product_id, m.warehouse_id, (m.occurred_at AT TIME ZONE (SELECT timezone FROM o))::date AS date,
               -SUM(m.quantity) AS qty
        FROM stock_movements m WHERE m.type = 'SALE' GROUP BY 1, 2, 3
      )
      SELECT COALESCE(l.product_id, d.product_id) AS product_id, COALESCE(l.date, d.date) AS date, l.qty AS ledger, d.quantity AS rollup
      FROM ledger l
      FULL JOIN sales_daily d ON d.product_id = l.product_id AND d.warehouse_id = l.warehouse_id AND d.date = l.date
      WHERE COALESCE(l.qty, 0) <> COALESCE(d.quantity, 0)`,
  },
  {
    name: 'reservations',
    description: 'Reserved stock never exceeds what is on hand',
    sql: `SELECT product_id, warehouse_id, on_hand, reserved FROM stock_levels WHERE reserved > on_hand OR reserved < 0`,
  },
];

/** Runs every ledger invariant against the database. */
export async function runLedgerChecks(prisma: Db): Promise<LedgerCheckResult[]> {
  const results: LedgerCheckResult[] = [];
  for (const check of CHECKS) {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(check.sql);
    results.push({
      name: check.name,
      description: check.description,
      violations: rows.length,
      examples: rows.slice(0, 5),
    });
  }
  return results;
}
