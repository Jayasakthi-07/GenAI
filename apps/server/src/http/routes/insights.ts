import {
  abcXyzSchema,
  deadStockSchema,
  forecastInsightsSchema,
  insightsQuerySchema,
  movementInsightsSchema,
  supplierInsightsSchema,
  turnoverSchema,
  valuationSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { requirePermission } from '../plugins/auth';

const view = requirePermission('inventory.view');
const schema = <T>(summary: string, response: T) => ({
  tags: ['insights'],
  summary,
  querystring: insightsQuerySchema,
  response: { 200: response },
});

export const insightRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { insights } = services;
  app.get(
    '/insights/valuation',
    {
      preHandler: view,
      schema: schema('Stock value by category and warehouse, with trend', valuationSchema),
    },
    (req) => insights.valuation(req.query),
  );
  app.get(
    '/insights/movements',
    {
      preHandler: view,
      schema: schema('Stock movements in and out over the period', movementInsightsSchema),
    },
    (req) => insights.movements(req.query),
  );
  app.get(
    '/insights/abc-xyz',
    { preHandler: view, schema: schema('ABC × XYZ matrix', abcXyzSchema) },
    (req) => insights.abcXyz(req.query),
  );
  app.get(
    '/insights/turnover',
    { preHandler: view, schema: schema('Turnover and days of inventory', turnoverSchema) },
    (req) => insights.turnover(req.query),
  );
  app.get(
    '/insights/forecast',
    { preHandler: view, schema: schema('Forecast accuracy and the demand outlook', forecastInsightsSchema) },
    (req) => insights.forecast(req.query),
  );
  app.get(
    '/insights/suppliers',
    { preHandler: view, schema: schema('Supplier performance', supplierInsightsSchema) },
    () => insights.suppliers(),
  );
  app.get(
    '/insights/dead-stock',
    { preHandler: view, schema: schema('Dead and slow stock', deadStockSchema) },
    (req) => insights.deadStock(req.query),
  );
};
