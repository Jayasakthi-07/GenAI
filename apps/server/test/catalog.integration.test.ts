import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ApiError,
  Category,
  ImportPreview,
  ImportResult,
  ProductDetail,
  ProductListItem,
  SupplierProduct,
  Warehouse,
} from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { uploadsDir } from '../src/services';
import { type Client, type Fixture, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

// 1×1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe.skipIf(!url)('catalog, import/export and suppliers (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Fixture;
  let manager: Client;
  let staff: Client;
  let admin: Client;

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    fx = await seedInventoryFixture(ctx.prisma);
    [manager, staff, admin] = await Promise.all([
      signIn(ctx.app, fx.users.manager.email),
      signIn(ctx.app, fx.users.staff.email),
      signIn(ctx.app, fx.users.admin.email),
    ]);
  });

  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  const productInput = (overrides: Record<string, unknown> = {}) => ({
    sku: 'ATTA-1',
    name: 'Whole Wheat Atta 5 kg',
    categoryId: fx.category.id,
    unitId: fx.unit.id,
    costPrice: '210',
    sellingPrice: '249',
    mrp: '265',
    taxRate: 5,
    tags: ['staple'],
    ...overrides,
  });

  describe('products', () => {
    let productId: string;

    it('creates a product (catalog managers only) and validates prices', async () => {
      expect((await staff.post('/products', productInput())).status).toBe(403);

      const belowCost = await manager.post<ApiError>('/products', productInput({ sellingPrice: '200' }));
      expect(belowCost.status).toBe(400);
      expect(belowCost.body.error.details).toMatchObject({
        fields: { sellingPrice: 'Selling price is below cost' },
      });

      const created = await manager.post<ProductDetail>('/products', productInput());
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({
        sku: 'ATTA-1',
        stockState: 'OUT',
        onHand: 0,
        costPrice: '210.00',
      });
      productId = created.body.id;

      const duplicate = await manager.post<ApiError>('/products', productInput({ sku: 'atta-1' }));
      expect(duplicate.status).toBe(409);
    });

    it('updates it, and refuses to turn off expiry tracking while stock exists', async () => {
      const updated = await manager.patch<ProductDetail>(
        `/products/${productId}`,
        productInput({ name: 'Whole Wheat Atta 5 kg (new pack)', reorderPoint: 20 }),
      );
      expect(updated.body).toMatchObject({ name: 'Whole Wheat Atta 5 kg (new pack)', reorderPoint: 20 });

      await manager.post('/stock/receive', {
        warehouseId: fx.chn.id,
        lines: [
          { productId: fx.milk.id, quantity: 5, unitCost: '50', batchNo: 'M1', expiryDate: '2099-01-01' },
        ],
      });
      const milk = await manager.get<ProductDetail>(`/products/${fx.milk.id}`);
      const res = await manager.patch<ApiError>(`/products/${fx.milk.id}`, {
        sku: milk.body.sku,
        name: milk.body.name,
        categoryId: fx.category.id,
        unitId: fx.unit.id,
        costPrice: milk.body.costPrice,
        sellingPrice: milk.body.sellingPrice,
        taxRate: 0,
        trackExpiry: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/expiry/i);
    });

    it('sets per-warehouse reorder levels', async () => {
      const res = await manager.patch<Array<{ warehouse: { id: string }; reorderPoint: number | null }>>(
        `/products/${productId}/stock/${fx.blr.id}`,
        {
          reorderPoint: 12,
          safetyStock: 4,
          maxStock: 60,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.find((s) => s.warehouse.id === fx.blr.id)?.reorderPoint).toBe(12);
    });

    it('searches, filters and sorts the list', async () => {
      const found = await staff.get<{ data: ProductListItem[]; meta: { total: number } }>('/products?q=atta');
      expect(found.body.data.map((p) => p.sku)).toEqual(['ATTA-1']);
      const byCategory = await staff.get<{ meta: { total: number } }>(`/products?categoryId=${fx.parent.id}`);
      expect(byCategory.body.meta.total).toBe(3); // Includes subcategories.
      const tracked = await staff.get<{ data: ProductListItem[] }>('/products?trackExpiry=true');
      expect(tracked.body.data.map((p) => p.sku)).toEqual(['MILK-1']);
      const sorted = await staff.get<{ data: ProductListItem[] }>('/products?sort=sku:desc');
      expect(sorted.body.data.map((p) => p.sku)).toEqual(['RICE-1', 'MILK-1', 'ATTA-1']);
    });

    it('applies bulk changes', async () => {
      const res = await manager.post<{ updated: number }>('/products/bulk', {
        action: 'add-tag',
        ids: [productId, fx.rice.id],
        tag: 'festive',
      });
      expect(res.body.updated).toBe(2);
      const tagged = await staff.get<{ meta: { total: number } }>('/products?tag=festive');
      expect(tagged.body.meta.total).toBe(2);
    });

    it('stores an uploaded image and serves it', async () => {
      const res = await manager.put<ProductDetail>(`/products/${productId}/image`, { dataUrl: PNG });
      expect(res.status).toBe(200);
      expect(res.body.imageUrl).toMatch(/^\/uploads\/products\/.+\.png$/);
      const file = await ctx.app.inject({ method: 'GET', url: res.body.imageUrl! });
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toBe('image/png');

      const bad = await manager.put<ApiError>(`/products/${productId}/image`, {
        dataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
      });
      expect(bad.status).toBe(400);

      const removed = await manager.del<ProductDetail>(`/products/${productId}/image`);
      expect(removed.body.imageUrl).toBeNull();
      expect(existsSync(resolve(uploadsDir(), res.body.imageUrl!.replace('/uploads/', '')))).toBe(false);
    });

    it('shows a product’s own history to anyone who can see it', async () => {
      const activity = await staff.get<{ data: Array<{ action: string }> }>(
        `/products/${productId}/activity`,
      );
      expect(activity.status).toBe(200);
      expect(activity.body.data.map((a) => a.action)).toEqual(
        expect.arrayContaining(['product.create', 'product.update']),
      );
    });
  });

  describe('CSV import and export', () => {
    const csv = [
      'sku,name,category,unit,cost_price,selling_price,tax_rate,tags,track_expiry,shelf_life_days',
      'DAL-1,Toor Dal 1 kg,Staples > Rice,pcs,120,145,5,"pulses;staple",false,',
      'CURD-1,Fresh Curd 400 g,rice,pcs,30,38,0,,true,10',
      'RICE-1,Ponni Rice 5 kg (renamed),Rice,pcs,400,490,5,,false,',
      'BAD-1,Broken Row,Nowhere,pcs,10,5,0,,false,',
    ].join('\r\n');

    it('previews without writing anything', async () => {
      const res = await manager.post<ImportPreview>('/products/import/preview', {
        csv,
        updateExisting: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ total: 4, create: 2, update: 1, skip: 0, error: 1 });
      const bad = res.body.rows.find((r) => r.sku === 'BAD-1');
      expect(bad?.errors.join(' ')).toMatch(/category/i);
      expect(await ctx.prisma.product.count({ where: { sku: 'DAL-1' } })).toBe(0);
    });

    it('imports the valid rows and reports the rest', async () => {
      const res = await manager.post<ImportResult>('/products/import/commit', { csv, updateExisting: true });
      expect(res.body).toMatchObject({ created: 2, updated: 1, failed: 1 });
      const dal = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'DAL-1' } });
      expect(dal.tags).toEqual(['pulses', 'staple']);
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'RICE-1' } })).name).toBe(
        'Ponni Rice 5 kg (renamed)',
      );
    });

    it('skips existing SKUs when asked to', async () => {
      const res = await manager.post<ImportPreview>('/products/import/preview', {
        csv,
        updateExisting: false,
      });
      expect(res.body.summary).toMatchObject({ create: 0, skip: 3 });
    });

    it('exports CSV that neutralises spreadsheet formulas, and Excel', async () => {
      await manager.patch(`/products/${fx.rice.id}`, {
        sku: 'RICE-1',
        name: '=HYPERLINK("x")',
        categoryId: fx.category.id,
        unitId: fx.unit.id,
        costPrice: '400',
        sellingPrice: '490',
        taxRate: 5,
      });
      const res = await staff.get<string>('/products/export?format=csv&q=RICE');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="products-.*\.csv"/);
      expect(res.body).toContain(`"'=HYPERLINK(""x"")"`);
      const xlsx = await staff.get('/products/export?format=xlsx');
      expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
      expect(xlsx.raw.subarray(0, 2).toString()).toBe('PK');
    });
  });

  describe('categories, units and warehouses', () => {
    it('builds the tree and prevents cycles', async () => {
      const child = await manager.post<Category>('/categories', {
        name: 'Basmati',
        parentId: fx.category.id,
      });
      expect(child.body.slug).toBe('basmati');
      const cycle = await manager.patch<ApiError>(`/categories/${fx.parent.id}`, {
        name: 'Staples',
        parentId: child.body.id,
      });
      expect(cycle.status).toBe(400);
      const inUse = await manager.del<ApiError>(`/categories/${fx.category.id}`);
      expect(inUse.status).toBe(409);
      expect((await manager.del(`/categories/${child.body.id}`)).status).toBe(200);
    });

    it('keeps exactly one default warehouse and lets only admins manage them', async () => {
      const input = { code: 'HYD', name: 'Hyderabad', city: 'Hyderabad', isDefault: true };
      expect((await manager.post('/warehouses', input)).status).toBe(403);
      const created = await admin.post<Warehouse>('/warehouses', input);
      expect(created.status).toBe(200);
      const all = await staff.get<Warehouse[]>('/warehouses');
      expect(all.body.filter((w) => w.isDefault).map((w) => w.code)).toEqual(['HYD']);

      const deactivate = await admin.patch<ApiError>(`/warehouses/${fx.chn.id}`, {
        code: 'CHN',
        name: 'Chennai',
        city: 'Chennai',
        isActive: false,
      });
      expect(deactivate.status).toBe(409);
    });

    it('refuses to delete a unit that products use', async () => {
      expect((await manager.del(`/units/${fx.unit.id}`)).status).toBe(409);
    });
  });

  describe('suppliers', () => {
    it('manages the supplier catalog and the preferred supplier', async () => {
      const atta = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'ATTA-1' } });
      const badMoq = await manager.post<ApiError>(`/suppliers/${fx.supplier.id}/catalog`, {
        productId: atta.id,
        unitCost: '205',
        moq: 5,
        packSize: 4,
        leadTimeDays: 3,
      });
      expect(badMoq.status).toBe(400);

      const res = await manager.post<SupplierProduct[]>(`/suppliers/${fx.supplier.id}/catalog`, {
        productId: atta.id,
        unitCost: '205',
        moq: 8,
        packSize: 4,
        leadTimeDays: 3,
        isPreferred: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.find((l) => l.product.id === atta.id)).toMatchObject({ isPreferred: true, moq: 8 });
      const product = await ctx.prisma.product.findUniqueOrThrow({ where: { id: atta.id } });
      expect(product).toMatchObject({ preferredSupplierId: fx.supplier.id, leadTimeDays: 3 });

      const link = res.body.find((l) => l.product.id === atta.id)!;
      expect((await manager.del(`/suppliers/${fx.supplier.id}/catalog/${link.id}`)).status).toBe(409);
      expect(
        (
          await staff.post(`/suppliers/${fx.supplier.id}/catalog`, {
            productId: atta.id,
            unitCost: '1',
            leadTimeDays: 1,
          })
        ).status,
      ).toBe(403);
    });

    it('scores a supplier from its purchase orders', async () => {
      const res = await staff.get<{ score: number | null }>(`/suppliers/${fx.supplier.id}/scorecard`);
      expect(res.status).toBe(200);
    });
  });
});
