import type {
  Category,
  CategoryInput,
  ReasonCode,
  ReasonCodeInput,
  SavedView,
  SavedViewInput,
  Unit,
  UnitInput,
  Warehouse,
  WarehouseInput,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, conflict, notFound, unauthenticated } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { money } from './support';

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Categories, units, warehouses, reason codes and saved views. */
export class CatalogService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  /* ── Categories ──────────────────────────────────────────────────────── */

  async categories(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    }));
  }

  /** The category and all of its descendants. */
  async categoryWithDescendants(id: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE tree AS (
        SELECT id FROM categories WHERE id = ${id}::uuid
        UNION ALL
        SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
      ) SELECT id FROM tree`;
    return rows.map((r) => r.id);
  }

  async saveCategory(actor: Actor, input: CategoryInput, id?: string): Promise<Category> {
    assertCan(actor, 'catalog.manage');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      if (input.parentId) {
        if (id && input.parentId === id)
          throw new AppError('VALIDATION_ERROR', 'A category can’t be its own parent.');
        const parent = await tx.category.findUnique({ where: { id: input.parentId } });
        if (!parent) throw notFound('Parent category');
        if (id) {
          const descendants = await this.categoryWithDescendants(id);
          if (descendants.includes(input.parentId)) {
            throw new AppError(
              'VALIDATION_ERROR',
              'A category can’t be moved inside one of its own subcategories.',
            );
          }
        }
      }
      const before = id ? await tx.category.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Category');
      let slug = slugify(input.name);
      if (!before || before.name !== input.name) {
        const taken = await tx.category.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
        if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      } else {
        slug = before.slug;
      }
      const data = {
        name: input.name,
        slug,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
      };
      const saved = id
        ? await tx.category.update({ where: { id }, data })
        : await tx.category.create({
            data: {
              ...data,
              sortOrder: await tx.category.count({ where: { parentId: input.parentId ?? null } }),
            },
          });
      await writeAudit(tx, actor, {
        action: id ? 'category.update' : 'category.create',
        entityType: 'Category',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} category ${saved.name}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'category', id: saved.id });
      const count = await tx.product.count({ where: { categoryId: saved.id } });
      return { ...saved, productCount: count };
    });
  }

  async deleteCategory(actor: Actor, id: string): Promise<void> {
    assertCan(actor, 'catalog.manage');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const category = await tx.category.findUnique({
        where: { id },
        include: { _count: { select: { products: true, children: true } } },
      });
      if (!category) throw notFound('Category');
      if (category._count.children) throw conflict('Move or delete its subcategories first.');
      if (category._count.products)
        throw conflict(`${category._count.products} product(s) use this category. Move them first.`);
      await tx.category.delete({ where: { id } });
      await writeAudit(tx, actor, {
        action: 'category.delete',
        entityType: 'Category',
        entityId: id,
        summary: `Deleted category ${category.name}`,
        before: category,
      });
      emit('catalog.changed', { entity: 'category', id });
    });
  }

  /* ── Units ───────────────────────────────────────────────────────────── */

  async units(): Promise<Unit[]> {
    const rows = await this.prisma.unit.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((u) => ({ id: u.id, code: u.code, name: u.name, productCount: u._count.products }));
  }

  async saveUnit(actor: Actor, input: UnitInput, id?: string): Promise<Unit> {
    assertCan(actor, 'catalog.manage');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = id ? await tx.unit.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Unit');
      const clash = await tx.unit.findFirst({ where: { code: input.code, NOT: id ? { id } : undefined } });
      if (clash) throw conflict(`A unit with code “${input.code}” already exists.`);
      const saved = id
        ? await tx.unit.update({ where: { id }, data: input })
        : await tx.unit.create({ data: input });
      await writeAudit(tx, actor, {
        action: id ? 'unit.update' : 'unit.create',
        entityType: 'Unit',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} unit ${saved.name}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'unit', id: saved.id });
      return { ...saved, productCount: await tx.product.count({ where: { unitId: saved.id } }) };
    });
  }

  async deleteUnit(actor: Actor, id: string): Promise<void> {
    assertCan(actor, 'catalog.manage');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const unit = await tx.unit.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!unit) throw notFound('Unit');
      if (unit._count.products) throw conflict(`${unit._count.products} product(s) use this unit.`);
      await tx.unit.delete({ where: { id } });
      await writeAudit(tx, actor, {
        action: 'unit.delete',
        entityType: 'Unit',
        entityId: id,
        summary: `Deleted unit ${unit.name}`,
        before: unit,
      });
      emit('catalog.changed', { entity: 'unit', id });
    });
  }

  /* ── Warehouses ──────────────────────────────────────────────────────── */

  async warehouses(): Promise<Warehouse[]> {
    const rows = await this.prisma.warehouse.findMany({ orderBy: [{ isDefault: 'desc' }, { code: 'asc' }] });
    const stats = await this.prisma.$queryRaw<Array<{ warehouse_id: string; skus: number; value: string }>>`
      SELECT warehouse_id, COUNT(*) FILTER (WHERE on_hand > 0)::int AS skus, COALESCE(SUM(on_hand * avg_cost), 0)::text AS value
      FROM stock_levels GROUP BY warehouse_id`;
    const byId = new Map(stats.map((s) => [s.warehouse_id, s]));
    return rows.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      city: w.city,
      address: w.address,
      isActive: w.isActive,
      isDefault: w.isDefault,
      skuCount: byId.get(w.id)?.skus ?? 0,
      stockValue: money(byId.get(w.id)?.value ?? 0),
    }));
  }

  async saveWarehouse(actor: Actor, input: WarehouseInput, id?: string): Promise<Warehouse> {
    assertCan(actor, 'organization.manage', 'Only admins can change warehouses.');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = id ? await tx.warehouse.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Warehouse');
      const clash = await tx.warehouse.findFirst({
        where: { code: input.code, NOT: id ? { id } : undefined },
      });
      if (clash) throw conflict(`Warehouse code ${input.code} is already used.`);
      if (before?.isActive && input.isActive === false) {
        const held = await tx.stockLevel.aggregate({ where: { warehouseId: id }, _sum: { onHand: true } });
        if ((held._sum.onHand ?? 0) > 0)
          throw conflict('Move or write off its stock before deactivating this warehouse.');
      }
      if (input.isDefault)
        await tx.warehouse.updateMany({
          where: { isDefault: true, NOT: id ? { id } : undefined },
          data: { isDefault: false },
        });
      if (before?.isDefault && input.isDefault === false)
        throw new AppError('VALIDATION_ERROR', 'Make another warehouse the default instead.');
      const data = { ...input, address: input.address ?? null };
      const saved = id
        ? await tx.warehouse.update({ where: { id }, data })
        : await tx.warehouse.create({ data });
      await writeAudit(tx, actor, {
        action: id ? 'warehouse.update' : 'warehouse.create',
        entityType: 'Warehouse',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} warehouse ${saved.code}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'warehouse', id: saved.id });
    });
    const list = await this.warehouses();
    const saved = list.find((w) => w.code === input.code);
    if (!saved) throw notFound('Warehouse');
    return saved;
  }

  /* ── Reason codes ────────────────────────────────────────────────────── */

  async reasonCodes(): Promise<ReasonCode[]> {
    const rows = await this.prisma.reasonCode.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      direction: r.direction,
      appliesTo: r.appliesTo,
      isActive: r.isActive,
    }));
  }

  async saveReasonCode(actor: Actor, input: ReasonCodeInput, id?: string): Promise<ReasonCode> {
    assertCan(actor, 'catalog.manage');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = id ? await tx.reasonCode.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Reason code');
      const clash = await tx.reasonCode.findFirst({
        where: { code: input.code, NOT: id ? { id } : undefined },
      });
      if (clash) throw conflict(`Reason code ${input.code} already exists.`);
      const saved = id
        ? await tx.reasonCode.update({ where: { id }, data: input })
        : await tx.reasonCode.create({ data: { ...input, sortOrder: await tx.reasonCode.count() } });
      await writeAudit(tx, actor, {
        action: id ? 'reason_code.update' : 'reason_code.create',
        entityType: 'ReasonCode',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} reason ${saved.label}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'reason_code', id: saved.id });
      return {
        id: saved.id,
        code: saved.code,
        label: saved.label,
        direction: saved.direction,
        appliesTo: saved.appliesTo,
        isActive: saved.isActive,
      };
    });
  }

  /* ── Saved views (per user) ──────────────────────────────────────────── */

  async savedViews(actor: Actor, page: string): Promise<SavedView[]> {
    if (actor.type !== 'user') throw unauthenticated();
    const rows = await this.prisma.savedView.findMany({
      where: { userId: actor.userId, page },
      orderBy: { name: 'asc' },
    });
    return rows.map((v) => ({
      id: v.id,
      page: v.page,
      name: v.name,
      state: v.state as Record<string, unknown>,
      isDefault: v.isDefault,
    }));
  }

  async saveView(actor: Actor, input: SavedViewInput, id?: string): Promise<SavedView> {
    if (actor.type !== 'user') throw unauthenticated();
    const userId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        const own = await tx.savedView.findFirst({ where: { id, userId } });
        if (!own) throw notFound('Saved view');
      }
      const clash = await tx.savedView.findFirst({
        where: { userId, page: input.page, name: input.name, NOT: id ? { id } : undefined },
      });
      if (clash) throw conflict(`You already have a view called “${input.name}”.`);
      if (input.isDefault)
        await tx.savedView.updateMany({ where: { userId, page: input.page }, data: { isDefault: false } });
      const data = {
        page: input.page,
        name: input.name,
        state: input.state as Prisma.InputJsonValue,
        isDefault: input.isDefault ?? false,
      };
      const v = id
        ? await tx.savedView.update({ where: { id }, data })
        : await tx.savedView.create({ data: { ...data, userId } });
      return {
        id: v.id,
        page: v.page,
        name: v.name,
        state: v.state as Record<string, unknown>,
        isDefault: v.isDefault,
      };
    });
  }

  async deleteView(actor: Actor, id: string): Promise<void> {
    if (actor.type !== 'user') throw unauthenticated();
    const res = await this.prisma.savedView.deleteMany({ where: { id, userId: actor.userId } });
    if (!res.count) throw notFound('Saved view');
  }
}
