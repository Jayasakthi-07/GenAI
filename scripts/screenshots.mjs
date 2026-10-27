#!/usr/bin/env node
/**
 * Visual QA: screenshots of every page at 1440 / 1024 / 390 px in light and dark, using the
 * installed Microsoft Edge (no browser download). Requires `pnpm dev` (or `pnpm start`) running.
 *
 *   node scripts/screenshots.mjs [--base=http://127.0.0.1:5173] [--out=data/screens] [--only=dashboard,login] [--as=admin]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const base = arg('base', 'http://127.0.0.1:5173');
const out = resolve(import.meta.dirname, '..', arg('out', 'data/screens'));
const only = arg('only', '')?.split(',').filter(Boolean);
// --as=admin|manager|staff, or a demo user's first name.
const DEMO_USERS = { admin: 'jayasakthi', manager: 'shaheer', staff: 'sameer' };
const as = arg('as', 'manager');
mkdirSync(out, { recursive: true });

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844, mobile: true },
];
const THEMES = ['light', 'dark'];
/** `path` may use :product, :po, :so, :supplier, :transfer, :count, :run, :action, :report and :conversation, resolved from the API once. */
const PAGES = [
  { key: 'login', path: '/login', auth: false },
  { key: 'dashboard', path: '/', full: true },
  { key: 'alerts', path: '/alerts' },
  { key: 'products', path: '/products' },
  { key: 'product', path: '/products/:product', full: true },
  { key: 'product-stock', path: '/products/:product?tab=stock' },
  { key: 'product-new', path: '/products/new' },
  { key: 'stock', path: '/stock' },
  { key: 'stock-movements', path: '/stock/movements' },
  { key: 'stock-batches', path: '/stock/batches' },
  { key: 'transfers', path: '/transfers' },
  { key: 'transfer', path: '/transfers/:transfer' },
  { key: 'cycle-counts', path: '/cycle-counts' },
  { key: 'cycle-count', path: '/cycle-counts/:count' },
  { key: 'suppliers', path: '/suppliers' },
  { key: 'supplier', path: '/suppliers/:supplier', full: true },
  { key: 'purchase-orders', path: '/purchase-orders' },
  { key: 'purchase-order', path: '/purchase-orders/:po', full: true },
  { key: 'po-new', path: '/purchase-orders/new' },
  { key: 'sales-orders', path: '/sales-orders' },
  { key: 'sales-order', path: '/sales-orders/:so' },
  { key: 'customers', path: '/customers' },
  { key: 'agents', path: '/agents' },
  { key: 'agents-activity', path: '/agents?tab=activity' },
  { key: 'agents-network', path: '/agents?tab=network' },
  { key: 'agent', path: '/agents/stock_sentinel', full: true },
  { key: 'agent-settings', path: '/agents/replenishment_planner?tab=settings', full: true },
  { key: 'agent-run', path: '/agents/runs/:run', full: true },
  { key: 'approvals', path: '/approvals' },
  { key: 'assistant', path: '/assistant' },
  { key: 'assistant-thread', path: '/assistant?c=:conversation', full: true },
  { key: 'assistant-panel', path: '/stock', action: 'assistant' },
  { key: 'approval', path: '/approvals?id=:action', full: true },
  { key: 'audit', path: '/audit' },
  { key: 'analytics', path: '/analytics', full: true },
  { key: 'analytics-movements', path: '/analytics?tab=movements', full: true },
  { key: 'analytics-abc', path: '/analytics?tab=abc-xyz', full: true },
  { key: 'analytics-turnover', path: '/analytics?tab=turnover', full: true },
  { key: 'analytics-forecast', path: '/analytics?tab=forecast', full: true },
  { key: 'analytics-suppliers', path: '/analytics?tab=suppliers', full: true },
  { key: 'analytics-dead', path: '/analytics?tab=dead-stock', full: true },
  { key: 'reports', path: '/reports' },
  { key: 'report', path: '/reports/:report', full: true },
  { key: 'notifications', path: '/', action: 'notifications' },
  { key: 'settings-organization', path: '/settings/organization', full: true },
  { key: 'settings-ai', path: '/settings/ai', full: true },
  { key: 'settings-warehouses', path: '/settings/warehouses' },
  { key: 'settings-categories', path: '/settings/categories' },
  { key: 'settings-appearance', path: '/settings/appearance' },
  { key: 'settings-account', path: '/settings/account' },
  { key: 'settings-notifications', path: '/settings/notifications' },
  { key: 'settings-data', path: '/settings/data' },
  { key: 'simulation', path: '/simulation', full: true },
  { key: 'about', path: '/about' },
  { key: 'design', path: '/design', full: true },
  { key: 'palette', path: '/', action: 'palette' },
  { key: 'menu', path: '/', action: 'menu', mobileOnly: true },
];

async function resolveIds(request) {
  const first = async (path) => {
    const res = await request.get(`${base}/api/v1${path}`);
    const body = await res.json();
    return body.data?.[0]?.id ?? '';
  };
  return {
    product: await first('/products?pageSize=1&sort=value:desc'),
    po: await first('/purchase-orders?pageSize=1&status=PARTIALLY_RECEIVED'),
    so: await first('/sales-orders?pageSize=1&status=FULFILLED'),
    supplier: await first('/suppliers?pageSize=1&sort=score:asc'),
    transfer: await first('/transfers?pageSize=1'),
    count: await first('/cycle-counts?pageSize=1'),
    run: await first('/agent-runs?pageSize=1&status=SUCCEEDED&agentKey=replenishment_planner'),
    action: await first('/actions?pageSize=1&status=PENDING'),
    report: await first('/reports?pageSize=1'),
    conversation: await (async () => {
      const res = await request.get(`${base}/api/v1/assistant/conversations`);
      const list = await res.json();
      return Array.isArray(list) ? (list[0]?.id ?? '') : '';
    })(),
  };
}
let ids = null;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const problems = [];
try {
  // Sign in once and reuse the session (sign-in is rate-limited).
  const authContext = await browser.newContext();
  const login = await authContext.request.post(`${base}/api/v1/auth/login`, {
    data: { email: `${DEMO_USERS[as] ?? as}@pmu.example`, password: 'stockroom2026' },
    headers: { origin: base },
  });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()} ${await login.text()}`);
  const storageState = await authContext.storageState();
  ids = await resolveIds(authContext.request);
  await authContext.close();

  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        colorScheme: theme,
        isMobile: !!size.mobile,
        hasTouch: !!size.mobile,
        reducedMotion: 'reduce',
        storageState,
      });
      // The live event stream never goes idle; 204 tells EventSource to stop instead of reconnecting.
      await context.route('**/api/v1/events', (route) => route.fulfill({ status: 204 }));

      for (const page of PAGES) {
        if (only.length && !only.includes(page.key)) continue;
        if (page.mobileOnly && !size.mobile) continue;
        const ctx =
          page.auth === false
            ? await browser.newContext({
                viewport: { width: size.width, height: size.height },
                colorScheme: theme,
                reducedMotion: 'reduce',
              })
            : context;
        const tab = await ctx.newPage();
        tab.on(
          'console',
          (m) =>
            m.type() === 'error' &&
            problems.push(
              `${page.key} ${theme} ${size.name}: console error: ${m.text()}${m.location().url ? ` (${m.location().url})` : ''}`,
            ),
        );
        tab.on('pageerror', (e) =>
          problems.push(`${page.key} ${theme} ${size.name}: page error: ${e.message}`),
        );
        const path = page.path.replace(/:(\w+)/g, (_, k) => ids[k] ?? '');
        await tab.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        await tab.waitForTimeout(400);
        if (page.action === 'palette') {
          await tab.keyboard.press('Control+K');
          await tab.waitForTimeout(300);
        }
        if (page.action === 'assistant') {
          await tab.keyboard.press('Control+J');
          await tab.waitForTimeout(900);
        }
        if (page.action === 'notifications') {
          await tab.getByRole('button', { name: /^Notifications/ }).click();
          await tab.waitForTimeout(400);
        }
        if (page.action === 'menu') {
          await tab.getByRole('button', { name: 'Open navigation' }).click();
          await tab.waitForTimeout(350);
        }
        // Horizontal overflow check: nothing may scroll sideways.
        const overflow = await tab.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1)
          problems.push(`${page.key} ${theme} ${size.name}: horizontal overflow of ${overflow}px`);
        await tab.screenshot({
          path: resolve(out, `${page.key}-${size.name}-${theme}.png`),
          fullPage: !!page.full,
        });
        await tab.close();
        if (ctx !== context) await ctx.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Screenshots written to ${out}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No console errors or horizontal overflow.');
}
