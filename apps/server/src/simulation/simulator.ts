import {
  SIMULATION_SCENARIO_INFO,
  SIMULATION_TICK_SECONDS,
  type SimulationScenario,
  type SimulationState,
} from '@stockroom/shared';
import { Rng } from '../demo/random';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import { AppError } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { InventoryService } from '../services/inventory.service';
import type { PurchaseOrderService } from '../services/purchase-order.service';
import type { SalesService } from '../services/sales.service';
import { Decimal, getOrgSettings, isoDay, localDay } from '../services/support';
import {
  type ActiveScenario,
  arrivalSeconds,
  DROP_CATEGORY,
  demandMultiplier,
  SCENARIO_HOURS,
  tickDemand,
} from './scenarios';

const SIMULATOR: Actor = { type: 'simulator' };

/** What survives a restart (in app_settings). */
interface Saved {
  speed: number;
  running: boolean;
  startedAt: string | null;
}
const SETTINGS_KEY = 'simulation';
/** Demand rates and customer lists are re-read this often while running. */
const REFRESH_MS = 10 * 60_000;

interface Location {
  productId: string;
  warehouseId: string;
  ratePerDay: number;
  category: string;
  trackExpiry: boolean;
  shelfLifeDays: number | null;
}

interface Model {
  at: number;
  locations: Location[];
  customers: Map<string, Array<{ id: string; type: 'RETAIL' | 'WHOLESALE' | 'ONLINE' }>>;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const CHANNEL = { RETAIL: 'STORE', WHOLESALE: 'WHOLESALE', ONLINE: 'ONLINE' } as const;

/**
 * The live demo simulator. Every few seconds it sells a slice of a simulated day at real
 * timestamps (so "today" absorbs an accelerated rush), sends approved purchase orders and
 * receives them after a lead time scaled to the simulator's speed. All writes go through the
 * same services people use, so the ledger, audit log, events and agent triggers behave exactly
 * as they would for real activity. Only available in demo mode.
 */
export class SimulationService {
  private timer: NodeJS.Timeout | null = null;
  private tick: Promise<void> | null = null;
  private speed = 2;
  private startedAt: Date | null = null;
  private simulatedHours = 0;
  private scenario: ActiveScenario | null = null;
  private model: Model | null = null;
  private rng = new Rng(Date.now() % 2_147_483_647);
  private lastError: string | null = null;
  private stats = {
    orders: 0,
    units: 0,
    revenue: new Decimal(0),
    sentOrders: 0,
    receipts: 0,
    adjustments: 0,
  };
  private requestRun: (agentKey: string, reason: string) => void = () => {};

  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly deps: {
      sales: SalesService;
      purchaseOrders: PurchaseOrderService;
      inventory: InventoryService;
    },
    private readonly available: boolean,
  ) {}

  private log: (err: unknown, message: string) => void = () => {};
  setLogger(fn: (err: unknown, message: string) => void) {
    this.log = fn;
  }

  /** Lets scenarios ask an agent to look now (the orchestrator decides whether it runs). */
  setAgentRequester(fn: (agentKey: string, reason: string) => void) {
    this.requestRun = fn;
  }

  get running() {
    return this.timer !== null;
  }

  async state(): Promise<SimulationState> {
    const org = await getOrgSettings(this.prisma);
    const today = localDay(new Date(), org.timezone);
    const last = await this.prisma.salesDaily.aggregate({
      _max: { date: true },
      where: { date: { lt: new Date(`${today}T00:00:00Z`) } },
    });
    return this.snapshot(isoDay(last._max.date));
  }

  private snapshot(lastSalesDay: string | null): SimulationState {
    const s = this.scenario;
    return {
      available: this.available,
      running: this.running,
      speed: this.speed,
      startedAt: this.startedAt?.toISOString() ?? null,
      simulatedHours: this.simulatedHours,
      scenario: s
        ? {
            key: s.key,
            label: SIMULATION_SCENARIO_INFO[s.key].label,
            detail: s.detail,
            hoursLeft: Math.max(0, s.hoursLeft),
          }
        : null,
      stats: { ...this.stats, revenue: this.stats.revenue.toFixed(2) },
      lastSalesDay,
      lastError: this.lastError,
    };
  }

  private async announce() {
    this.bus.emit('simulation.state', await this.state());
  }

  private assertAvailable(actor: Actor) {
    assertCan(actor, 'simulation.control');
    if (!this.available)
      throw new AppError('FORBIDDEN', 'The simulator only runs in demo mode (DEMO_MODE=true in .env).');
  }

  private async saved(): Promise<Saved> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return { speed: 2, running: false, startedAt: null, ...(row?.value as Partial<Saved> | null) };
  }

  private async save(patch: Partial<Saved>) {
    const value = { ...(await this.saved()), ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
  }

  async start(actor: Actor): Promise<SimulationState> {
    this.assertAvailable(actor);
    if (!this.running) {
      this.speed = (await this.saved()).speed;
      this.startedAt = new Date();
      this.simulatedHours = 0;
      this.lastError = null;
      this.stats = {
        orders: 0,
        units: 0,
        revenue: new Decimal(0),
        sentOrders: 0,
        receipts: 0,
        adjustments: 0,
      };
      await this.save({ running: true, startedAt: this.startedAt.toISOString() });
      this.schedule();
    }
    await this.announce();
    return this.state();
  }

  /**
   * At boot: carry on if the simulator was running when the server stopped (a restart in the
   * middle of a demonstration shouldn't end it). Orders sent before the restart still arrive.
   */
  async resume(): Promise<void> {
    if (!this.available || this.running) return;
    const saved = await this.saved();
    if (!saved.running) return;
    this.speed = saved.speed;
    this.startedAt = saved.startedAt ? new Date(saved.startedAt) : new Date();
    this.schedule();
    await this.announce();
  }

  private schedule() {
    this.timer = setInterval(() => this.runTick(), SIMULATION_TICK_SECONDS * 1000);
    this.timer.unref();
    this.runTick();
  }

  /** Stops ticking and waits for the tick in progress, if any. */
  async stop(actor: Actor = SIMULATOR): Promise<SimulationState> {
    assertCan(actor, 'simulation.control');
    await this.halt();
    await this.save({ running: false });
    await this.announce();
    return this.state();
  }

  /** Pauses for a server shutdown without forgetting that the simulator was on. */
  async halt(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scenario = null;
    await this.tick;
  }

  async setSpeed(actor: Actor, speed: number): Promise<SimulationState> {
    this.assertAvailable(actor);
    this.speed = speed;
    await this.save({ speed });
    await this.announce();
    return this.state();
  }

  async runScenario(actor: Actor, key: SimulationScenario): Promise<SimulationState> {
    this.assertAvailable(actor);
    await this.tick;
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    const hours = SCENARIO_HOURS[key];
    if (key === 'festive_rush') {
      this.scenario = {
        key,
        hoursLeft: hours,
        detail: 'Festive categories selling at 4× normal, the rest at 1.8×.',
      };
    } else if (key === 'demand_drop') {
      const category = await this.dropCategory();
      this.scenario = {
        key,
        hoursLeft: hours,
        category,
        detail: `${category} selling at a third of normal.`,
      };
    } else if (key === 'supplier_delay') {
      this.scenario = await this.delaySupplier(today, hours);
      this.requestRun('supplier_analyst', 'A supplier missed its delivery dates');
    } else {
      this.scenario = await this.shrinkage();
    }
    if (!this.running && hours > 0) return this.start(actor);
    await this.announce();
    return this.state();
  }

  private runTick() {
    if (this.tick) return;
    this.tick = this.step()
      .then(() => {
        this.lastError = null;
      })
      .catch((err: unknown) => {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.log(err, 'simulator tick failed');
      })
      .finally(() => {
        this.tick = null;
        if (this.running) void this.announce().catch(() => {});
      });
  }

  private async step() {
    const hours = this.speed;
    const model = await this.loadModel();
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    await this.sell(model, hours, today);
    await this.sendApproved();
    await this.receiveDue(model);
    this.simulatedHours += hours;
    if (this.scenario) {
      this.scenario.hoursLeft -= hours;
      if (this.scenario.hoursLeft <= 0) this.scenario = null;
    }
  }

  private async loadModel(): Promise<Model> {
    if (this.model && Date.now() - this.model.at < REFRESH_MS) return this.model;
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    // Each location sells at its average over the last four complete weeks.
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        warehouse_id: string;
        rate: number;
        category: string;
        track_expiry: boolean;
        shelf_life_days: number | null;
      }>
    >`
      SELECT s.product_id, s.warehouse_id, (SUM(s.quantity) / 28.0)::float8 AS rate,
             COALESCE(pc.name, c.name) AS category, p.track_expiry, p.shelf_life_days
      FROM sales_daily s
      JOIN products p ON p.id = s.product_id AND p.status = 'ACTIVE'
      JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE s.date >= ${today}::date - 28 AND s.date < ${today}::date
      GROUP BY 1, 2, 4, 5, 6`;
    const buyers = await this.prisma.$queryRaw<
      Array<{ warehouse_id: string; id: string; type: 'RETAIL' | 'WHOLESALE' | 'ONLINE' }>
    >`
      SELECT DISTINCT so.warehouse_id, c.id, c.type::text AS type
      FROM sales_orders so JOIN customers c ON c.id = so.customer_id AND c.is_active
      WHERE so.order_date >= now() - interval '90 days'`;
    const customers = new Map<string, Array<{ id: string; type: 'RETAIL' | 'WHOLESALE' | 'ONLINE' }>>();
    for (const b of buyers) customers.set(b.warehouse_id, [...(customers.get(b.warehouse_id) ?? []), b]);
    if (!customers.size) {
      const any = await this.prisma.customer.findMany({
        where: { isActive: true },
        select: { id: true, type: true },
      });
      const warehouses = await this.prisma.warehouse.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const w of warehouses) customers.set(w.id, any);
    }
    this.model = {
      at: Date.now(),
      customers,
      locations: rows.map((r) => ({
        productId: r.product_id,
        warehouseId: r.warehouse_id,
        ratePerDay: r.rate,
        category: r.category,
        trackExpiry: r.track_expiry,
        shelfLifeDays: r.shelf_life_days,
      })),
    };
    return this.model;
  }

  /** One sales order per warehouse per tick, for a customer who buys from that warehouse. */
  private async sell(model: Model, hours: number, today: string) {
    const byWarehouse = new Map<string, Location[]>();
    for (const l of model.locations)
      byWarehouse.set(l.warehouseId, [...(byWarehouse.get(l.warehouseId) ?? []), l]);
    for (const [warehouseId, locations] of byWarehouse) {
      const buyers = model.customers.get(warehouseId) ?? [];
      if (!buyers.length) continue;
      // Expired batches still count as on hand until someone writes them off, but can't be sold.
      const stock = await this.prisma.$queryRaw<Array<{ product_id: string; available: number }>>`
        SELECT v.product_id,
               GREATEST(0, v.available - COALESCE((
                 SELECT SUM(b.quantity) FROM batches b
                 WHERE b.product_id = v.product_id AND b.warehouse_id = v.warehouse_id
                   AND b.quantity > 0 AND b.expiry_date < ${today}::date), 0))::int AS available
        FROM v_stock_positions v WHERE v.warehouse_id = ${warehouseId}::uuid`;
      const available = new Map(stock.map((s) => [s.product_id, s.available]));
      const lines = locations.flatMap((l) => {
        const quantity = tickDemand(
          l.ratePerDay * Math.exp(this.rng.normal(0, 0.15)),
          hours,
          demandMultiplier(this.scenario, l.category),
          available.get(l.productId) ?? 0,
          (lambda) => this.rng.poisson(lambda),
        );
        return quantity > 0 ? [{ productId: l.productId, quantity }] : [];
      });
      if (!lines.length) continue;
      const customer = this.rng.pick(buyers);
      const so = await this.deps.sales.create(SIMULATOR, {
        customerId: customer.id,
        warehouseId,
        channel: CHANNEL[customer.type],
        notes: 'Simulated order',
        lines,
        confirm: true,
      });
      await this.deps.sales.fulfill(SIMULATOR, so.id);
      this.stats.orders++;
      this.stats.units += lines.reduce((a, l) => a + l.quantity, 0);
      this.stats.revenue = this.stats.revenue.add(so.total);
    }
  }

  /** In demo mode an approved order goes straight to the supplier. */
  private async sendApproved() {
    const approved = await this.prisma.purchaseOrder.findMany({
      where: { status: 'APPROVED' },
      select: { id: true },
      take: 20,
    });
    for (const po of approved) {
      await this.deps.purchaseOrders.send(SIMULATOR, po.id);
      this.stats.sentOrders++;
    }
  }

  /**
   * Receives orders sent while the simulator runs once their (scaled) lead time has passed.
   * Orders sent before it started keep their real dates, and a delayed supplier's are held.
   */
  private async receiveDue(model: Model) {
    if (!this.startedAt) return;
    const open = await this.prisma.purchaseOrder.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, sentAt: { gte: this.startedAt } },
      select: {
        id: true,
        supplierId: true,
        orderDate: true,
        expectedDate: true,
        sentAt: true,
        warehouseId: true,
        lines: {
          select: {
            id: true,
            productId: true,
            quantityOrdered: true,
            quantityReceived: true,
            quantityRejected: true,
          },
        },
      },
    });
    const held = this.scenario?.key === 'supplier_delay' ? this.scenario.supplierId : undefined;
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    for (const po of open) {
      if (po.supplierId === held || !po.sentAt) continue;
      const leadDays = po.expectedDate
        ? Math.round((po.expectedDate.getTime() - po.orderDate.getTime()) / 86_400_000)
        : 3;
      const due = po.sentAt.getTime() + arrivalSeconds(leadDays, this.speed, SIMULATION_TICK_SECONDS) * 1000;
      if (Date.now() < due) continue;
      const products = new Map(
        model.locations.filter((l) => l.warehouseId === po.warehouseId).map((l) => [l.productId, l]),
      );
      const lines = po.lines.flatMap((l) => {
        const remaining = l.quantityOrdered - l.quantityReceived - l.quantityRejected;
        if (remaining <= 0) return [];
        const p = products.get(l.productId);
        return [
          {
            purchaseOrderLineId: l.id,
            quantityReceived: remaining,
            ...(p?.trackExpiry
              ? {
                  batchNo: `SIM-${today.replaceAll('-', '')}-${l.id.slice(-4)}`,
                  expiryDate: addDays(today, p.shelfLifeDays ?? 180),
                }
              : {}),
          },
        ];
      });
      if (!lines.length) continue;
      await this.deps.purchaseOrders.receive(SIMULATOR, po.id, { notes: 'Simulated delivery', lines });
      this.stats.receipts++;
    }
  }

  private async dropCategory(): Promise<string> {
    const model = await this.loadModel();
    if (model.locations.some((l) => l.category === DROP_CATEGORY)) return DROP_CATEGORY;
    const totals = new Map<string, number>();
    for (const l of model.locations) totals.set(l.category, (totals.get(l.category) ?? 0) + l.ratePerDay);
    return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DROP_CATEGORY;
  }

  /** The supplier with the most open orders misses its dates: those orders become overdue. */
  private async delaySupplier(today: string, hours: number): Promise<ActiveScenario> {
    const open = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] } },
      _count: { _all: true },
      orderBy: { _count: { supplierId: 'desc' } },
      take: 1,
    });
    const supplierId = open[0]?.supplierId;
    if (!supplierId)
      throw new AppError('CONFLICT', 'No supplier has open purchase orders to delay. Approve one first.');
    const supplier = await this.prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
      select: { name: true },
    });
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { supplierId, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] } },
      select: { id: true },
    });
    for (const po of orders)
      await this.deps.purchaseOrders.reschedule(
        SIMULATOR,
        po.id,
        addDays(today, -2),
        `${supplier.name} missed the delivery date (simulated delay).`,
      );
    return {
      key: 'supplier_delay',
      hoursLeft: hours,
      supplierId,
      detail: `${supplier.name}: ${orders.length} open ${orders.length === 1 ? 'order is' : 'orders are'} overdue and deliveries are on hold.`,
    };
  }

  /** Unexplained losses of the most valuable fast-moving stock at one warehouse. */
  private async shrinkage(): Promise<ActiveScenario> {
    const reason = await this.prisma.reasonCode.findFirst({ where: { code: 'SHRINKAGE', isActive: true } });
    if (!reason) throw new AppError('CONFLICT', 'The SHRINKAGE reason code is missing or inactive.');
    // A warehouse that holds stock worth losing, then its most valuable positions there.
    const eligible = await this.prisma.$queryRaw<
      Array<{ warehouse_id: string; warehouse: string; product_id: string; available: number }>
    >`
      SELECT v.warehouse_id, w.name AS warehouse, v.product_id, v.available::int AS available
      FROM v_stock_positions v
      JOIN products p ON p.id = v.product_id
      JOIN warehouses w ON w.id = v.warehouse_id AND w.is_active
      WHERE v.available >= 12 AND NOT p.track_expiry AND p.status = 'ACTIVE'
      ORDER BY v.value DESC`;
    if (!eligible.length) throw new AppError('CONFLICT', 'There is no stock to lose: receive some first.');
    const warehouseIds = [...new Set(eligible.map((e) => e.warehouse_id))];
    const whId = this.rng.pick(warehouseIds);
    const targets = eligible.filter((e) => e.warehouse_id === whId).slice(0, 4);
    const wh = { id: whId, name: targets[0]?.warehouse ?? '' };
    for (const t of targets) {
      const quantity = -Math.max(3, Math.round(t.available * this.rng.float(0.25, 0.4)));
      await this.deps.inventory.adjust(SIMULATOR, {
        warehouseId: wh.id,
        productId: t.product_id,
        quantity,
        reasonCodeId: reason.id,
        note: 'Shortfall found on a shelf check; no record of where it went (simulated).',
      });
      this.stats.adjustments++;
    }
    return {
      key: 'shrinkage',
      hoursLeft: 0,
      detail: `${targets.length} high-value ${targets.length === 1 ? 'product' : 'products'} short at ${wh.name}.`,
    };
  }
}
