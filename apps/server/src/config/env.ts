import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

/** Directory that contains pnpm-workspace.yaml (the repository root). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** Loads the root .env once. Variables already set in the process environment win. */
export function loadRootEnv(): void {
  const file = resolve(findRepoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z
    .string()
    .default('127.0.0.1')
    .refine((h) => ['127.0.0.1', 'localhost', '::1'].includes(h), {
      message: 'must be 127.0.0.1, localhost or ::1 — Stockroom only listens on this computer',
    }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  APP_ORIGINS: optionalString,
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  DATABASE_URL: z
    .string({ error: 'is required — run `pnpm bootstrap`, then put the stockroom password into .env' })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), { message: 'must start with postgresql://' })
    .refine((v) => !v.includes('CHANGE_ME'), {
      message: 'still contains CHANGE_ME — replace it with the password of the stockroom role',
    }),
  TEST_DATABASE_URL: optionalString,

  COOKIE_SECRET: z
    .string({ error: 'is required — run `pnpm bootstrap` to generate it' })
    .min(32, 'must be at least 32 characters — run `pnpm bootstrap` to generate one'),
  APP_ENCRYPTION_KEY: z
    .string({ error: 'is required — run `pnpm bootstrap` to generate it' })
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'must be 32 random bytes encoded as base64 — run `pnpm bootstrap` to generate one',
    }),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(168),

  SEED: z.coerce.number().int().default(20260927),
  DEMO_MODE: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),

  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  GEMINI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  NVIDIA_API_KEY: optionalString,
  CEREBRAS_API_KEY: optionalString,
  MISTRAL_API_KEY: optionalString,
  GITHUB_MODELS_TOKEN: optionalString,
  HUGGINGFACE_API_KEY: optionalString,
});

export type Env = z.infer<typeof envSchema> & { allowedOrigins: string[] };

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  • ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'} ${issue.message}`),
    );
  }
  const env = result.data;
  const defaults = [env.API_PORT, env.WEB_PORT].flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  const extra = env.APP_ORIGINS?.split(',').map((o) => o.trim().replace(/\/$/, '')) ?? [];
  return { ...env, allowedOrigins: [...new Set([...defaults, ...extra])] };
}

/** Human-readable startup failure: what's wrong and how to fix it. */
export function formatEnvError(error: EnvError): string {
  return [
    '',
    'Stockroom can’t start because the environment isn’t set up correctly:',
    ...error.problems.map((p) => `  • ${p}`),
    '',
    'Edit .env in the repository root (run `pnpm bootstrap` to create it), then try again.',
    '',
  ].join('\n');
}
