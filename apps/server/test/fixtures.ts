import type { createPrisma } from '../src/db/client';
import { hashPassword } from '../src/services/password';
import type { createTestApp } from './helpers';
import { sessionCookie, TEST_ORIGIN } from './helpers';

type Db = ReturnType<typeof createPrisma>;
type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

export const PASSWORD = 'fixture-pass-1';

/** Offsets today by n days as YYYY-MM-DD (UTC calendar; tests keep a wide margin around it). */
export const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A small, fully known inventory: two warehouses, one plain product (rice), one expiry-tracked
 * product (milk), one supplier that sells both, a customer and the standard reason codes.
 */
export async function seedInventoryFixture(prisma: Db) {
  await prisma.organization.create({ data: { name: 'Fixture Traders', settings: {} } });
  const passwordHash = await hashPassword(PASSWORD);
  const user = (role: 'ADMIN' | 'MANAGER' | 'STAFF') =>
    prisma.user.create({
      data: { email: `${role.toLowerCase()}@fixture.example`, name: `Fixture ${role}`, role, passwordHash },
    });
  const admin = await user('ADMIN');
  const manager = await user('MANAGER');
  const staff = await user('STAFF');
  const unit = await prisma.unit.create({ data: { code: 'pcs', name: 'Piece' } });
  const parent = await prisma.category.create({ data: { name: 'Staples', slug: 'staples' } });
  const category = await prisma.category.create({
    data: { name: 'Rice', slug: 'rice', parentId: parent.id },
  });
  const chn = await prisma.warehouse.create({
    data: { code: 'CHN', name: 'Chennai', city: 'Chennai', isDefault: true },
  });
  const blr = await prisma.warehouse.create({ data: { code: 'BLR', name: 'Bengaluru', city: 'Bengaluru' } });

  const reasons = Object.fromEntries(
    await Promise.all(
      (
        [
          ['DAMAGED', 'OUT', ['ADJUSTMENT', 'WRITE_OFF']],
          ['EXPIRED', 'OUT', ['WRITE_OFF']],
          ['FOUND', 'IN', ['ADJUSTMENT']],
          ['DATA_ENTRY', 'BOTH', ['ADJUSTMENT']],
          ['SAMPLE', 'OUT', ['ADJUSTMENT', 'ISSUE']],
          ['INTERNAL_USE', 'OUT', ['ISSUE']],
          ['COUNT_VARIANCE', 'BOTH', ['COUNT_CORRECTION']],
        ] as const
      ).map(async ([code, direction, appliesTo], i) => {
        const r = await prisma.reasonCode.create({
          data: { code, label: code, direction, appliesTo: [...appliesTo], sortOrder: i },
        });
        return [code, r.id] as const;
      }),
    ),
  ) as Record<
    'DAMAGED' | 'EXPIRED' | 'FOUND' | 'DATA_ENTRY' | 'SAMPLE' | 'INTERNAL_USE' | 'COUNT_VARIANCE',
    string
  >;

  const supplier = await prisma.supplier.create({
    data: { code: 'SUP', name: 'Fixture Supplies', city: 'Chennai', paymentTermsDays: 30 },
  });
  const rice = await prisma.product.create({
    data: {
      sku: 'RICE-1',
      name: 'Ponni Rice 5 kg',
      categoryId: category.id,
      unitId: unit.id,
      costPrice: '400.00',
      sellingPrice: '480.00',
      taxRate: '5',
      reorderPoint: 40,
      safetyStock: 15,
      maxStock: 200,
      leadTimeDays: 4,
      preferredSupplierId: supplier.id,
    },
  });
  const milk = await prisma.product.create({
    data: {
      sku: 'MILK-1',
      name: 'Toned Milk 1 L',
      categoryId: category.id,
      unitId: unit.id,
      costPrice: '50.00',
      sellingPrice: '60.00',
      trackExpiry: true,
      shelfLifeDays: 120,
      reorderPoint: 10,
      maxStock: 100,
      leadTimeDays: 2,
      preferredSupplierId: supplier.id,
    },
  });
  await prisma.supplierProduct.createMany({
    data: [
      {
        supplierId: supplier.id,
        productId: rice.id,
        unitCost: '400.00',
        leadTimeDays: 4,
        supplierSku: 'S-RICE',
      },
      {
        supplierId: supplier.id,
        productId: milk.id,
        unitCost: '50.00',
        leadTimeDays: 2,
        supplierSku: 'S-MILK',
      },
    ],
  });
  const customer = await prisma.customer.create({
    data: { code: 'CUST', name: 'Corner Store', type: 'RETAIL' },
  });

  return {
    users: { admin, manager, staff },
    unit,
    parent,
    category,
    chn,
    blr,
    reasons,
    supplier,
    rice,
    milk,
    customer,
  };
}

export type Fixture = Awaited<ReturnType<typeof seedInventoryFixture>>;

/** A tiny HTTP client bound to one signed-in user. */
export async function signIn(app: TestApp, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: TEST_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`Sign-in failed for ${email}: ${res.body}`);
  const cookie = sessionCookie(res.headers['set-cookie']);
  const request = async <T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const r = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie, origin: TEST_ORIGIN },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    const body = r.headers['content-type']?.toString().includes('json')
      ? r.json<T>()
      : (r.body as unknown as T);
    return { status: r.statusCode, body, headers: r.headers, raw: r.rawPayload };
  };
  return {
    get: <T = unknown>(url: string) => request<T>('GET', url),
    post: <T = unknown>(url: string, payload: unknown = {}) => request<T>('POST', url, payload),
    patch: <T = unknown>(url: string, payload: unknown) => request<T>('PATCH', url, payload),
    put: <T = unknown>(url: string, payload: unknown) => request<T>('PUT', url, payload),
    del: <T = unknown>(url: string) => request<T>('DELETE', url),
  };
}

export type Client = Awaited<ReturnType<typeof signIn>>;

export async function level(prisma: Db, productId: string, warehouseId: string) {
  const l = await prisma.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  return { onHand: l?.onHand ?? 0, reserved: l?.reserved ?? 0, avgCost: l?.avgCost.toString() ?? '0' };
}
