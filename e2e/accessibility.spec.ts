import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/alerts',
  '/products',
  '/stock',
  '/purchase-orders',
  '/agents',
  '/approvals',
  '/assistant',
  '/analytics',
  '/analytics?tab=forecast',
  '/reports',
  '/simulation',
  '/settings/notifications',
  '/settings/data',
];

for (const scheme of ['light', 'dark'] as const) {
  test(`main pages have no serious accessibility problems (${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('Email').fill('shafeer@pmu.example');
    await page.getByLabel('Password', { exact: true }).fill('stockroom2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));

    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of result.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
        problems.push(
          `${path}: ${v.id} (${v.impact}) ${v.help} — ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
        );
    }
    await context.close();
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('the keyboard reaches the content first and focus is visible', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('shafeer@pmu.example');
  await page.getByLabel('Password', { exact: true }).fill('stockroom2026');
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  // The next stop is a real control with a visible focus ring.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  expect(outline).not.toBeNull();
  expect(outline!.outline !== 'none' || outline!.shadow !== 'none').toBe(true);
});
