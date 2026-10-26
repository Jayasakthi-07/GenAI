import type { ForecastResult } from '../analytics/forecasting';
import type { Db } from '../db/client';
import { toJson } from '../db/json';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import type { EventBus } from '../domain/events';
import { iso } from './support';

export interface LatestForecast {
  productId: string;
  avgDailyDemand: number;
  demandStdDev: number;
  method: string;
  pattern: string;
  mape: number | null;
  wape: number | null;
  generatedAt: string;
}

/** Stored demand forecasts (one latest row per product; older rows kept for accuracy history). */
export class ForecastService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  async latest(): Promise<Map<string, LatestForecast>> {
    const rows = await this.prisma.forecast.findMany({
      where: { isLatest: true, warehouseId: null },
      select: {
        productId: true,
        avgDailyDemand: true,
        demandStdDev: true,
        method: true,
        demandPattern: true,
        mape: true,
        wape: true,
        generatedAt: true,
      },
    });
    return new Map(
      rows.map((r) => [
        r.productId,
        {
          productId: r.productId,
          avgDailyDemand: Number(r.avgDailyDemand),
          demandStdDev: Number(r.demandStdDev),
          method: r.method,
          pattern: r.demandPattern,
          mape: r.mape === null ? null : Number(r.mape),
          wape: r.wape === null ? null : Number(r.wape),
          generatedAt: r.generatedAt.toISOString(),
        },
      ]),
    );
  }

  /** Replaces each product's latest forecast. */
  async save(
    actor: Actor,
    runId: string | null,
    items: Array<{ productId: string; result: ForecastResult }>,
  ) {
    assertCan(actor, 'inventory.view');
    if (!items.length) return 0;
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      await tx.forecast.updateMany({
        where: { isLatest: true, warehouseId: null, productId: { in: items.map((i) => i.productId) } },
        data: { isLatest: false },
      });
      await tx.forecast.createMany({
        data: items.map(({ productId, result: r }) => ({
          productId,
          warehouseId: null,
          method: r.method,
          demandPattern: r.pattern,
          horizonDays: r.points.length,
          historyDays: r.historyDays,
          params: toJson(r.params),
          points: toJson(r.points),
          avgDailyDemand: r.avgDailyDemand.toFixed(4),
          demandStdDev: r.demandStdDev.toFixed(4),
          mape: r.mape === null ? null : Math.min(99_999, r.mape).toFixed(2),
          wape: r.wape === null ? null : Math.min(99_999, r.wape).toFixed(2),
          isLatest: true,
          agentRunId: runId,
        })),
      });
      await writeAudit(tx, actor, {
        action: 'forecast.generate',
        entityType: 'Forecast',
        summary: `Generated forecasts for ${items.length} products`,
        after: { products: items.length },
      });
      emit('forecast.updated', { count: items.length });
    });
    return items.length;
  }

  /** The latest forecast for one product (product page chart and the Assistant). */
  async forProduct(productId: string) {
    const r = await this.prisma.forecast.findFirst({
      where: { productId, isLatest: true, warehouseId: null },
      orderBy: { generatedAt: 'desc' },
    });
    if (!r) return null;
    return {
      method: r.method,
      pattern: r.demandPattern,
      horizonDays: r.horizonDays,
      historyDays: r.historyDays,
      avgDailyDemand: Number(r.avgDailyDemand),
      demandStdDev: Number(r.demandStdDev),
      mape: r.mape === null ? null : Number(r.mape),
      wape: r.wape === null ? null : Number(r.wape),
      generatedAt: iso(r.generatedAt),
      points: r.points as Array<{
        h: number;
        yhat: number;
        lo80: number;
        hi80: number;
        lo95: number;
        hi95: number;
      }>,
    };
  }
}
