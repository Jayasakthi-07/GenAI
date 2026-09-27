/**
 * Loads the deterministic demo dataset.
 *   pnpm db:seed              wipe application tables and seed
 *   pnpm db:seed --dry-run    simulate and verify in memory only (no database needed)
 */
import { EnvError, formatEnvError, loadRootEnv } from '../../src/config/env';
import { createPrisma, describeDbError } from '../../src/db/client';
import { DEMO_PASSWORD, USERS, WAREHOUSES } from '../../src/demo/catalog';
import { buildDemoData, seedDemoData, verifyDemoData } from '../../src/demo/seed';

loadRootEnv();
const seed = Number(process.env.SEED ?? 20260927);
const dryRun = process.argv.includes('--dry-run');
// --date=YYYY-MM-DD simulates as if today were that date (useful to check the dataset is stable over time).
const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice(7);
const now = dateArg ? new Date(`${dateArg}T12:00:00+05:30`) : new Date();
const log = (message: string) => console.log(`  ${message}`);

function summarize(data: ReturnType<typeof buildDemoData>) {
  const { sim } = data;
  const ordered = sim.salesOrders.flatMap((o) => o.lines).reduce((a, l) => a + l.quantity, 0);
  const fulfilled = sim.salesOrders.flatMap((o) => o.lines).reduce((a, l) => a + l.quantityFulfilled, 0);
  const onOrder = new Map<string, number>();
  for (const po of sim.purchaseOrders) {
    if (po.status !== 'SENT' && po.status !== 'PARTIALLY_RECEIVED') continue;
    for (const l of po.lines) {
      const k = `${l.productId}|${po.warehouseId}`;
      onOrder.set(k, (onOrder.get(k) ?? 0) + l.quantityOrdered - l.quantityReceived - l.quantityRejected);
    }
  }
  const out = sim.stockLevels.filter((s) => s.onHand === 0).length;
  const low = sim.stockLevels.filter(
    (s) => s.onHand > 0 && s.onHand + (onOrder.get(`${s.productId}|${s.warehouseId}`) ?? 0) <= s.reorderPoint,
  ).length;
  const days = new Set(sim.salesDaily.filter((d) => d.date >= addDaysIso(data.today, -90)).map((d) => d.date))
    .size;
  const cogs90 =
    sim.salesDaily.filter((d) => d.date >= addDaysIso(data.today, -90)).reduce((a, d) => a + d.cogsPaise, 0) /
    100;
  const value = sim.stockLevels.reduce((a, s) => a + s.onHand * Number(s.avgCost), 0);
  const revenue30 =
    sim.salesDaily
      .filter((d) => d.date >= addDaysIso(data.today, -30))
      .reduce((a, d) => a + d.revenuePaise, 0) / 100;
  const statuses = new Map<string, number>();
  for (const po of sim.purchaseOrders) statuses.set(po.status, (statuses.get(po.status) ?? 0) + 1);
  console.log(`
  Demo data for ${data.today} (seed ${seed})
    products ${data.products.length} · warehouses ${WAREHOUSES.length} · stock locations ${sim.stockLevels.length}
    movements ${sim.movements.length.toLocaleString('en-IN')} · batches ${sim.batches.length.toLocaleString('en-IN')} · sales orders ${sim.salesOrders.length.toLocaleString('en-IN')}
    purchase orders ${sim.purchaseOrders.length.toLocaleString('en-IN')} (${[...statuses].map(([s, n]) => `${s} ${n}`).join(', ')})
    receipts ${sim.receipts.length.toLocaleString('en-IN')} · transfers ${sim.transfers.length} · cycle counts ${sim.cycleCounts.length}
    fill rate ${((fulfilled / ordered) * 100).toFixed(1)}% · inventory value ₹${Math.round(value).toLocaleString('en-IN')} · revenue last 30 days ₹${Math.round(revenue30).toLocaleString('en-IN')}
    days of inventory ≈ ${(value / (cogs90 / Math.max(1, days))).toFixed(1)} · out of stock ${out} · needs reorder (on hand + on order ≤ ROP) ${low}
  Planted situations:
${sim.notes.map((n) => `    - ${n}`).join('\n')}`);
}

function addDaysIso(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (dryRun) {
    const started = performance.now();
    const data = buildDemoData(seed, now);
    const problems = verifyDemoData(data);
    console.log(`\n  Simulated in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    summarize(data);
    if (problems.length) {
      console.error(`\n  Invariant violations:\n${problems.map((p) => `    ✖ ${p}`).join('\n')}`);
      process.exit(1);
    }
    console.log('\n  ✔ Ledger, batch and purchase-order invariants hold.\n');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('CHANGE_ME')) {
    throw new EnvError(['DATABASE_URL is not set — put the stockroom password into .env']);
  }
  const prisma = createPrisma(databaseUrl);
  try {
    console.log('\n  Seeding demo data…');
    const data = await seedDemoData({ prisma, databaseUrl, seed, now, log });
    summarize(data);
    console.log(`\n  Demo logins (password: ${DEMO_PASSWORD})`);
    for (const u of USERS) console.log(`    ${u.role.padEnd(8)} ${u.email}`);
    console.log('');
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (['ECONNREFUSED', '28P01', '3D000', 'ETIMEDOUT'].includes(code))
      throw new Error(describeDbError(error, databaseUrl), { cause: error });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvError ? formatEnvError(error) : error);
  process.exit(1);
});
