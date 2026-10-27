import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

/** The seeded demo accounts (DEMO_MODE): see apps/server/src/demo/catalog.ts. */
const DEMO_PASSWORD = 'stockroom2026';
const MANAGER = 'manager@kaveri.example';
const ADMIN = 'admin@kaveri.example';

/**
 * Fails the test on any console error, uncaught exception, or request that leaves this machine
 * (the app must work offline: fonts, icons and libraries are bundled).
 */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('request', (r) => {
    const { protocol, hostname } = new URL(r.url());
    if (/^https?:$/.test(protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(hostname))
      errors.push(`external request: ${r.url()}`);
  });
  return errors;
}

async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function api(request: APIRequestContext, method: 'get' | 'post', path: string, data?: unknown) {
  const res = await request[method](`/api/v1${path}`, {
    data,
    headers: { origin: new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:5173').origin },
  });
  expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<Record<string, unknown>>;
}

test('signs in and every main page renders without errors', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, MANAGER);
  await expect(
    page.getByRole('heading', { level: 2, name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();

  const pages: Array<[string, string | RegExp]> = [
    ['/alerts', 'Alerts'],
    ['/products', 'Products'],
    ['/stock', 'Stock'],
    ['/purchase-orders', 'Purchase orders'],
    ['/sales-orders', 'Sales orders'],
    ['/agents', 'Agents'],
    ['/approvals', 'Approvals'],
    ['/analytics', 'Analytics'],
    ['/reports', 'Reports'],
    ['/simulation', 'Simulation'],
    ['/settings/notifications', 'Settings'],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 2, name: heading }).first()).toBeVisible();
  }
  // The command palette finds pages and offers the Assistant.
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search/).fill('reorder rice');
  await expect(page.getByText('Ask the Assistant:')).toBeVisible();
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test('receives an approved purchase order and the stock goes up', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, MANAGER);
  const request = page.request;

  // A product without expiry tracking (no batch needed) that has a preferred supplier.
  type Detail = {
    id: string;
    costPrice: string;
    preferredSupplier: { id: string } | null;
    stock: Array<{ warehouse: { id: string }; onHand: number }>;
  };
  const list = (await api(request, 'get', '/products?trackExpiry=false&status=ACTIVE&pageSize=25')) as {
    data: Array<{ id: string }>;
  };
  let product: Detail | undefined;
  for (const p of list.data) {
    const d = (await api(request, 'get', `/products/${p.id}`)) as Detail;
    if (d.preferredSupplier && d.stock.length) {
      product = d;
      break;
    }
  }
  expect(product, 'a product with a preferred supplier').toBeTruthy();
  const warehouseId = product!.stock[0]!.warehouse.id;
  const onHand = async () => {
    const d = (await api(request, 'get', `/products/${product!.id}`)) as Detail;
    return d.stock.find((s) => s.warehouse.id === warehouseId)?.onHand ?? 0;
  };
  const before = await onHand();

  // Small enough to be approved automatically on submission.
  const po = (await api(request, 'post', '/purchase-orders', {
    supplierId: product!.preferredSupplier!.id,
    warehouseId,
    lines: [{ productId: product!.id, quantityOrdered: 3, unitCost: product!.costPrice }],
    notes: 'End-to-end smoke test',
    submit: true,
  })) as { id: string; number: string; status: string };
  expect(po.status).toBe('APPROVED');

  await page.goto(`/purchase-orders/${po.id}`);
  await page.getByRole('button', { name: 'Receive' }).click();
  const dialog = page.getByRole('dialog', { name: `Receive ${po.number}` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Record receipt' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Received', { exact: true }).first()).toBeVisible();

  expect(await onHand()).toBe(before + 3);
  expect(errors).toEqual([]);
});

test('a temporary password must be replaced before going on', async ({ browser }) => {
  // An admin creates a user with a temporary password …
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN);
  const email = `e2e.${Date.now()}@kaveri.example`;
  const temporary = `Temp${Date.now()}x`;
  await api(admin.request, 'post', '/users', {
    email,
    name: 'Smoke Test',
    role: 'STAFF',
    password: temporary,
  });
  await adminContext.close();

  // … who signs in and is asked to choose their own.
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = watchForErrors(page);
  await signIn(page, email, temporary);
  const dialog = page.getByRole('dialog', { name: 'Choose your own password' });
  await expect(dialog).toBeVisible();
  // It can't be dismissed.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  const chosen = `Mine${Date.now()}y`;
  await dialog.getByLabel('Temporary password').fill(temporary);
  await dialog.getByLabel('New password', { exact: true }).fill(chosen);
  await dialog.getByLabel('Confirm new password').fill(chosen);
  await dialog.getByRole('button', { name: 'Set password' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('top-bar menus open and their links work', async ({ page }) => {
  const errors = watchForErrors(page);
  await signIn(page, MANAGER);

  // Account menu: links rendered as menu items.
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);

  // Model chip menu, its settings link, theme menu and the notification bell.
  await page.getByRole('button', { name: /^(Model:|AI unavailable)/ }).click();
  await page.getByRole('menuitem', { name: /AI & models settings/ }).click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByText('Choose what you’re notified about')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  expect(errors).toEqual([]);
});
