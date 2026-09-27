import { defineConfig } from 'tsdown';

/**
 * Production bundle for `pnpm build && pnpm start`. The shared workspace package (TypeScript source)
 * and the generated Prisma client are bundled; npm dependencies stay external.
 */
export default defineConfig({
  entry: { main: 'src/main.ts', seed: 'prisma/seed/index.ts', 'check-ledger': 'src/scripts/check-ledger.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  deps: { alwaysBundle: ['@stockroom/shared'] },
});
