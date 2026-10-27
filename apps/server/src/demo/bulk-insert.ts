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

/**
 * Drops the secondary indexes and foreign keys of the given tables for a bulk load and returns a
 * function that rebuilds them. Building an index once over loaded rows, and validating a foreign
 * key with one join, is several times faster than maintaining both row by row. Run inside the
 * load's transaction: PostgreSQL DDL is transactional, so a failed load restores everything.
 */
export async function suspendIndexes(
  client: PoolClient,
  tables: readonly string[],
): Promise<() => Promise<void>> {
  const indexes = await client.query<{ name: string; def: string }>(
    `SELECT i.indexrelid::regclass::text AS name, pg_get_indexdef(i.indexrelid) AS def
     FROM pg_index i
     WHERE i.indrelid = ANY($1::regclass[]) AND NOT i.indisprimary
       AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)`,
    [tables],
  );
  const fks = await client.query<{ tbl: string; name: string; def: string }>(
    `SELECT conrelid::regclass::text AS tbl, conname AS name, pg_get_constraintdef(oid) AS def
     FROM pg_constraint WHERE contype = 'f' AND conrelid = ANY($1::regclass[])`,
    [tables],
  );
  for (const fk of fks.rows) await client.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT "${fk.name}"`);
  for (const ix of indexes.rows) await client.query(`DROP INDEX ${ix.name}`);
  return async () => {
    await client.query(`SET LOCAL maintenance_work_mem = '256MB'`);
    for (const ix of indexes.rows) await client.query(ix.def);
    for (const fk of fks.rows)
      await client.query(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT "${fk.name}" ${fk.def}`);
  };
}
