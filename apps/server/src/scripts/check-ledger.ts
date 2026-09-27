/**
 * pnpm check:ledger — verifies the stock ledger invariants in the configured database.
 * Exits non-zero if any invariant is violated.
 */
import { EnvError, formatEnvError, loadRootEnv, parseEnv } from '../config/env';
import { assertDatabaseReachable, createPrisma } from '../db/client';
import { runLedgerChecks } from './ledger-checks';

async function main() {
  loadRootEnv();
  const env = parseEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  try {
    await assertDatabaseReachable(prisma, env.DATABASE_URL);
    const started = performance.now();
    const results = await runLedgerChecks(prisma);
    console.log('\nLedger checks\n');
    for (const r of results) {
      console.log(
        `  ${r.violations ? '\x1b[31m✖' : '\x1b[32m✔'}\x1b[0m ${r.description}${r.violations ? ` — ${r.violations} violation(s)` : ''}`,
      );
      for (const example of r.examples)
        console.log(
          `      ${JSON.stringify(example, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))}`,
        );
    }
    const failed = results.filter((r) => r.violations > 0).length;
    console.log(
      `\n  ${failed ? `${failed} check(s) failed` : 'All checks passed'} in ${Math.round(performance.now() - started)} ms\n`,
    );
    process.exitCode = failed ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof EnvError ? formatEnvError(error) : error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
