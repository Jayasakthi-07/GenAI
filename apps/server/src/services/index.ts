import { resolve } from 'node:path';
import { type Env, findRepoRoot } from '../config/env';
import type { Db } from '../db/client';
import type { EventBus } from '../domain/events';
import { AlertService } from './alert.service';
import { AuditService } from './audit.service';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { CycleCountService } from './cycle-count.service';
import { DashboardService } from './dashboard.service';
import { InventoryService } from './inventory.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { SalesService } from './sales.service';
import { SearchService } from './search.service';
import { SettingsService } from './settings.service';
import { SupplierService } from './supplier.service';
import { TransferService } from './transfer.service';
import { UserService } from './user.service';

export interface ServiceDeps {
  prisma: Db;
  bus: EventBus;
  env: Env;
}

export const uploadsDir = () => resolve(findRepoRoot(), 'data', 'uploads');

/** Composition root for domain services. Routes and agent tools both use these instances. */
export function createServices({ prisma, bus, env }: ServiceDeps) {
  const inventory = new InventoryService(prisma, bus);
  const catalog = new CatalogService(prisma, bus);
  const suppliers = new SupplierService(prisma, bus);
  const services = {
    auth: new AuthService(prisma, bus, env.SESSION_TTL_HOURS),
    users: new UserService(prisma),
    dashboard: new DashboardService(prisma),
    inventory,
    catalog,
    products: new ProductService(prisma, bus, catalog, uploadsDir()),
    suppliers,
    purchaseOrders: new PurchaseOrderService(prisma, bus, inventory),
    sales: new SalesService(prisma, bus, inventory),
    transfers: new TransferService(prisma, bus, inventory),
    cycleCounts: new CycleCountService(prisma, bus, inventory, catalog),
    alerts: new AlertService(prisma, bus),
    audit: new AuditService(prisma),
    settings: new SettingsService(prisma, bus),
    search: new SearchService(prisma),
  };
  // Supplier scores are derived from purchase orders and receipts.
  bus.on('po.status_changed', () => suppliers.invalidateScores());
  bus.on('po.received', () => suppliers.invalidateScores());
  return services;
}

export type Services = ReturnType<typeof createServices>;
