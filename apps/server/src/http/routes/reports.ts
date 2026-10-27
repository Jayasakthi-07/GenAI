import {
  paginated,
  REPORT_TYPES,
  reportListItemSchema,
  reportSchema,
  reportsQuerySchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { renderReportPdf } from '../../reports/pdf/report';
import type { Services } from '../../services';
import { requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');

export const reportRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { reports } = services;
  app.get(
    '/reports',
    {
      preHandler: view,
      schema: {
        tags: ['reports'],
        querystring: reportsQuerySchema,
        response: { 200: paginated(reportListItemSchema) },
      },
    },
    (req) => reports.list(req.query),
  );
  app.get(
    '/reports/latest',
    {
      preHandler: view,
      schema: {
        tags: ['reports'],
        summary: 'The most recent report, optionally of one type (null when none has been written)',
        querystring: z.object({ type: z.enum(REPORT_TYPES).optional() }),
        response: { 200: reportSchema.nullable() },
      },
    },
    (req) => reports.latest(req.query.type),
  );
  app.get(
    '/reports/:id',
    { preHandler: view, schema: { tags: ['reports'], params: idParams, response: { 200: reportSchema } } },
    (req) => reports.get(req.params.id),
  );
  app.get(
    '/reports/:id/pdf',
    {
      preHandler: view,
      schema: {
        tags: ['reports'],
        summary: 'Printable PDF',
        params: idParams,
        querystring: z.object({ download: z.enum(['0', '1']).default('0') }),
      },
    },
    async (req, reply) => {
      const { report, organization } = await reports.forExport(req.params.id);
      const pdf = await renderReportPdf(report, organization);
      const name = `${report.type === 'WEEKLY_SUMMARY' ? 'weekly-summary' : 'daily-briefing'}-${report.periodEnd.slice(0, 10)}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${name}"`,
        )
        .send(pdf);
    },
  );
  app.get(
    '/reports/:id/csv',
    { preHandler: view, schema: { tags: ['reports'], summary: 'Every figure as CSV', params: idParams } },
    async (req, reply) => {
      const { filename, body } = await reports.csv(req.params.id);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(body);
    },
  );
};
