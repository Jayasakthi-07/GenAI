import { APP_NAME } from '@stockroom/shared';
import { pino } from 'pino';
import { buildApp } from './app';
import { EnvError, formatEnvError, loadRootEnv, parseEnv } from './config/env';
import { assertDatabaseReachable, createPrisma } from './db/client';
import { AppError } from './domain/errors';
import { loggerOptions } from './lib/logger';

async function main() {
  loadRootEnv();
  const env = parseEnv();
  const isProd = env.NODE_ENV === 'production';
  const logOptions = loggerOptions(env.LOG_LEVEL, !isProd);
  const log = pino(logOptions);

  const prisma = createPrisma(env.DATABASE_URL);
  await assertDatabaseReachable(prisma, env.DATABASE_URL);

  const app = await buildApp({ env, prisma, logger: logOptions, serveWeb: isProd, startAgents: true });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.API_PORT });
  const url = `http://${env.HOST}:${env.API_PORT}`;
  log.info(
    isProd
      ? `${APP_NAME} is running at ${url}`
      : `${APP_NAME} API ready at ${url}/api/v1 — docs at ${url}/api/docs — open the app at http://${env.HOST}:${env.WEB_PORT}`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof EnvError) {
    console.error(formatEnvError(error));
  } else if (error instanceof AppError && error.code === 'DB_UNAVAILABLE') {
    console.error(`\n${error.message}\n\nRun \`pnpm preflight\` to diagnose.\n`);
  } else if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
    console.error(
      `\nPort is already in use. Is ${APP_NAME} already running? Change API_PORT in .env if needed.\n`,
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
