import type { LoggerOptions } from 'pino';

/** Paths that must never reach the logs. Pino replaces them with "[redacted]". */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.confirmPassword',
  '*.passwordHash',
  '*.apiKey',
  '*.token',
  '*.tokenHash',
  'headers.authorization',
  'headers["x-api-key"]',
];

export function loggerOptions(level: string, pretty: boolean): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,reqId', singleLine: true },
          },
        }
      : {}),
  };
}
