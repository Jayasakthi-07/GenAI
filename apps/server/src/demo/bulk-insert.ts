import type { PoolClient } from 'pg';

export type Column = readonly [name: string, pgType: string];

type Value = string | number | boolean | Date | null;

/**
 * Fast bulk insert: one `INSERT … SELECT * FROM unnest(array, array, …)` per chunk,
 * so each chunk is a single statement with one parameter per column.
 */
export async function bulkInsert(
  client: PoolClient,
  table: string,
  columns: readonly Column[],
  rows: readonly Value[][],
  chunkSize = 20_000,
): Promise<void> {
  if (!rows.length) return;
  const names = columns.map(([name]) => `"${name}"`).join(', ');
  const casts = columns.map(([, type], i) => `$${i + 1}::${type}[]`).join(', ');
  const sql = `INSERT INTO "${table}" (${names}) SELECT * FROM unnest(${casts})`;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const arrays = columns.map((_, c) =>
      chunk.map((row) => {
        const v = row[c] ?? null;
        return v instanceof Date ? v.toISOString() : v;
      }),
    );
    await client.query(sql, arrays);
  }
}

/** Paise (integer) → "1234.56". */
export const rupees = (paise: number) => (paise / 100).toFixed(2);
