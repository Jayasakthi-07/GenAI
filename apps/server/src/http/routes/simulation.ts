import {
  demoResetResultSchema,
  SIMULATION_SCENARIOS,
  simulationSpeedSchema,
  simulationStateSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';

const control = requirePermission('simulation.control');
const tags = ['simulation'];
const state = { 200: simulationStateSchema };

export const simulationRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { simulation, demo } = services;

  app.get(
    '/simulation',
    {
      preHandler: requirePermission('inventory.view'),
      schema: { tags, summary: 'Simulator state', response: state },
    },
    () => simulation.state(),
  );
  app.post(
    '/simulation/start',
    { preHandler: control, schema: { tags, summary: 'Start the live simulator', response: state } },
    (req) => simulation.start(actorFor(req)),
  );
  app.post(
    '/simulation/stop',
    { preHandler: control, schema: { tags, summary: 'Stop the simulator', response: state } },
    (req) => simulation.stop(actorFor(req)),
  );
  app.patch(
    '/simulation',
    {
      preHandler: control,
      schema: {
        tags,
        summary: 'Change the speed (simulated hours per tick)',
        body: simulationSpeedSchema,
        response: state,
      },
    },
    (req) => simulation.setSpeed(actorFor(req), req.body.speed),
  );
  app.post(
    '/simulation/scenarios/:key',
    {
      preHandler: control,
      schema: {
        tags,
        summary: 'Run a scenario (starts the simulator if needed)',
        params: z.object({ key: z.enum(SIMULATION_SCENARIOS) }),
        response: state,
      },
    },
    (req) => simulation.runScenario(actorFor(req), req.params.key),
  );
  app.post(
    '/demo/reset',
    {
      preHandler: requirePermission('demo.reset'),
      schema: {
        tags,
        summary: 'Reload the demo data (keeps AI and agent settings, sessions and preferences)',
        response: { 200: demoResetResultSchema },
      },
    },
    (req) => demo.reset(actorFor(req)),
  );
};
