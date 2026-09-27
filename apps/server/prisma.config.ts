import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// The single .env lives at the repository root.
function loadRootEnv(start: string): void {
  let dir = start;
  for (;;) {
    const candidate = resolve(dir, '.env');
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      if (existsSync(candidate)) process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadRootEnv(import.meta.dirname);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // `prisma generate` doesn't connect, so a fresh clone without .env can still generate the client.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/stockroom',
  },
});
