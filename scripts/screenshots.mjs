#!/usr/bin/env node
/**
 * Visual QA: screenshots of every page at 1440 / 1024 / 390 px in light and dark, using the
 * installed Microsoft Edge (no browser download). Requires `pnpm dev` (or `pnpm start`) running.
 *
 *   node scripts/screenshots.mjs [--base=http://127.0.0.1:5173] [--out=data/screens] [--only=dashboard,login]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const base = arg('base', 'http://127.0.0.1:5173');
const out = resolve(import.meta.dirname, '..', arg('out', 'data/screens'));
const only = arg('only', '')?.split(',').filter(Boolean);
mkdirSync(out, { recursive: true });

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844, mobile: true },
];
const THEMES = ['light', 'dark'];
const PAGES = [
  { key: 'login', path: '/login', auth: false },
  { key: 'dashboard', path: '/', full: true },
  { key: 'settings-appearance', path: '/settings/appearance' },
  { key: 'settings-account', path: '/settings/account' },
  { key: 'about', path: '/about' },
  { key: 'design', path: '/design', full: true },
  { key: 'palette', path: '/', action: 'palette' },
  { key: 'menu', path: '/', action: 'menu', mobileOnly: true },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const problems = [];
try {
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        colorScheme: theme,
        isMobile: !!size.mobile,
        hasTouch: !!size.mobile,
        reducedMotion: 'reduce',
      });
      const login = await context.request.post(`${base}/api/v1/auth/login`, {
        data: { email: 'manager@kaveri.example', password: 'stockroom2026' },
        headers: { origin: base },
      });
      if (!login.ok()) throw new Error(`Login failed: ${login.status()} ${await login.text()}`);

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
            problems.push(`${page.key} ${theme} ${size.name}: console error: ${m.text()}`),
        );
        tab.on('pageerror', (e) =>
          problems.push(`${page.key} ${theme} ${size.name}: page error: ${e.message}`),
        );
        await tab.goto(`${base}${page.path}`, { waitUntil: 'networkidle' });
        await tab.waitForTimeout(400);
        if (page.action === 'palette') {
          await tab.keyboard.press('Control+K');
          await tab.waitForTimeout(300);
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
