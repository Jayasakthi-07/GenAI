# CLAUDE.md — Stockroom

**Automatic Inventory Management Using Agents** (product name: Stockroom, `APP_NAME` in `packages/shared`).
A localhost-only, full-stack inventory app in which a team of AI agents monitors stock, forecasts demand, drafts POs,
catches anomalies, scores suppliers and writes reports, while people approve consequential actions.

- **Source of truth:** `docs/PROJECT_BRIEF.md`. Re-read the relevant section before starting each phase.
- **Plan and status:** `docs/PLAN.md` (architecture, schema, agents, API, phase checklist). Tick items as they land.
- **Current phase:** Phases 2–6 (core inventory, LLM gateway, agent runtime, analytics and agents, insights, reports,
  notifications, simulation and demo reset) complete and committed. Next: Phase 7 (polish and acceptance).

## Commands (pnpm 12, Node 24 LTS; all scripts cross-platform)

```
pnpm bootstrap        # create .env from .env.example and generate secrets
pnpm preflight        # check Node, pnpm, PostgreSQL and Ollama (not "doctor": that's a pnpm built-in)
pnpm db:seed -- --dry-run [--date=YYYY-MM-DD]   # simulate + verify the demo data in memory
pnpm db:setup         # migrate + seed (deterministic)
pnpm db:reset         # drop, migrate, seed
pnpm dev              # server (node --watch + tsx, 127.0.0.1:4000) + web (Vite, 127.0.0.1:5173, proxies /api)
pnpm build && pnpm start   # production build; Fastify serves the SPA on one port
pnpm typecheck | lint | format | test | test:e2e
pnpm check:ledger     # verify every balance equals the sum of its ledger
pnpm qa:screens       # screenshots of every page at 1440/1024/390 × light/dark (needs pnpm dev running)
pnpm --filter @stockroom/server <script>   # run a script in one package
```

## Layout

```
apps/web          React SPA (Vite 8, TanStack Router/Query/Table, Tailwind 4, shadcn/Radix restyled)
apps/server       Fastify 5 API, services, Prisma 7, pg-boss 12, agent runtime, LLM gateway, SSE
packages/shared   Zod schemas (DTOs), constants (APP_NAME, roles, permissions, enums), formatters
scripts/          Node scripts (bootstrap, doctor, check-ledger, reset-demo)
docs/             brief, plan, architecture, agents, demo script
```

## Non-negotiables (from the brief)

1. Everything visible works. No placeholders, "coming soon", fake charts or lorem ipsum. Hide unfinished features and tell the user.
2. Agents do real work through tools on real data.
3. **Numbers come from code; judgment comes from the model.** `apps/server/src/analytics/` is pure and tested;
   the LLM reads its results through tools, never computes them.
4. Works offline with Ollama, and with no model at all (rule-based output labelled "Rule-based — AI unavailable").
5. Provider-agnostic: changing provider or model is a settings change only.
6. UI/UX is the top priority (brief §8).
7. Strict TypeScript, real error handling, tests, docs.

## Architecture rules

- Routes are thin: Zod-validated input/output → one service call → response. **No Prisma in routes.**
- **All business rules live in services.** Every service method takes an `ActorContext`
  (user | agent+runId | system | simulator) and checks permissions with `ctx.can()`.
- Agents are just another client of the services. Tools call services; **agents never touch Prisma**.
- Stock changes **only** through `InventoryService.recordMovement()`: one transaction with row locks, a ledger row with
  `balanceAfter`, a balance update, a `SalesDaily` rollup, and a refusal to go negative. A DB CHECK is the backstop.
- Every mutation writes an `AuditLog` row (actor = user or agent + run ID) **in the same transaction**.
- Domain events are emitted **after commit** on the typed bus → orchestrator (debounced agent triggers) and SSE hub.
- Money: Prisma `Decimal` → `decimal.js` in services → string in JSON. Never floats. Quantities are integers.
- Agent write tools create `AgentAction` proposals; execution is gated by autonomy (`observe`/`recommend`/`act`) and limits.
  Informational outputs (alerts, forecasts, scorecards, reports) are recorded directly.
- LLMs never orchestrate. The orchestrator, schedules, locks and hand-offs are deterministic code.
- Scheduled and event runs call the LLM only when the deterministic fingerprint changed (otherwise `NO_CHANGE`).
- Nothing outside `ai/gateway` imports a provider adapter. No hardcoded model IDs except suggested defaults.
- API keys: AES-256-GCM at rest, never returned to the browser (last 4 only), never logged (Pino redact).

## Conventions

- TypeScript **6.0.x** strict (typescript-eslint doesn't support TS 7 yet). No `any` without an explaining comment.
- Prisma **7.10** (not the `latest` 8.0 RC): `prisma.config.ts`, `prisma-client` generator → `src/generated/prisma`,
  `@prisma/adapter-pg`. UUIDv7 ids. snake_case tables/columns via `@map`. All timestamps `timestamptz`.
  Raw SQL in migrations for CHECKs, partial unique indexes and the `v_stock_positions` view — when generating later
  migrations, strip any `DROP` of those hand-written objects (see PLAN.md "Phase 1 decisions"). No native
  PostgreSQL extensions (Windows Smart App Control blocked `pg_trgm`; see "Phase 2 decisions").
- Demo data lives in `apps/server/src/demo/` (catalog, simulator, plants, bulk insert). Planted situations must stay
  date-independent: after changing the simulator, dry-run several `--date=` values; `seed.test.ts` guards invariants.
- Every database connection runs in UTC: pass `SESSION_OPTIONS` (`apps/server/src/db/client.ts`) to any new pg pool.
  The pg adapter sends timestamps as UTC wall-clock text; a local server default shifts them against SQL's `now()`.
- Day-based figures use complete days (history ends yesterday); today is still in progress.
- Never put `NODE_ENV` in `.env` (Vite would bundle development React).
- Ports are `API_PORT` / `WEB_PORT`, never `PORT` (tools inject a generic `PORT` into child processes).
- `tsx watch` hangs under `concurrently` (non-TTY): the server dev script is `node --watch --import tsx`.
- lucide-react 1.x removed old aliases: use `TriangleAlert`, `CircleAlert`, etc.
- Zod 4: normalize before validating (`z.string().trim().toLowerCase().pipe(z.email())`).
- Errors: throw typed `AppError(code, message, details?)`. The central handler sends `{ error: { code, message, details? } }`.
  Never send stack traces. Use actionable messages ("Can't reach PostgreSQL at 127.0.0.1:5432 — is the service running?").
- API under `/api/v1`. Lists return `{ data, meta: { page, pageSize, total } }`; the ledger and audit log use cursors.
- Shared Zod schemas in `packages/shared/src/schemas/<domain>.ts` are used by both server and web forms.
- Small focused modules. Comments only where the _why_ isn't obvious. Files and folders are kebab-case; React components are PascalCase.
- Tests sit next to code (`*.test.ts`). Integration tests use a separate `stockroom_test` database.
- Frontend data: TanStack Query with keys from `lib/query-keys.ts`; SSE events invalidate via one map.
- **Check current official docs before integrating any library or provider.** Several majors are newer than common
  knowledge: TanStack Table 9, pg-boss 12, Prisma 7, Vite 8, Vitest 5, ESLint 10, lucide-react 1.x, Motion 13, @google/genai 2.x.

## Design rules (brief §8, short form)

- Apple-inspired: calm, content-first, premium. Build every screen from the tokens in `apps/web/src/styles/tokens.css`.
- Type: `-apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", sans-serif`; scale 12/13/15/17/20/24/32;
  semibold headings with slight negative tracking; **tabular numerals for all figures**.
- Neutral surfaces, one refined blue accent, green/amber/red for status only. True dark theme in layered grays.
- 4/8-pt spacing. Radius 8 (controls) / 14 (cards) / 20 (sheets and dialogs). Hairline borders. Shadows only on floating layers.
- Translucent sidebar, top bar and sheets (backdrop blur with a solid fallback). Motion 150–250 ms, respect reduced motion.
- Lucide icons at one stroke width. **No emoji.** No purple/rainbow gradients, neon glows or heavy shadows.
- AI-generated content always carries `<AiMarker/>` (icon + "AI" label) and shows the model name.
- Every data view has skeleton, empty (with next action) and error (with retry) states.
- Tables: sticky header, density toggle, right-aligned numbers, status pills; stacked cards on phone.
- Money in INR with `en-IN` grouping (₹12,34,567.00) via `packages/shared/src/format`.
- Review every page at 1440, 1024 and 390 px in light and dark before calling a phase done.

## Localhost and offline

- Everything binds to `127.0.0.1`: Fastify, Vite, PostgreSQL (`listen_addresses = 'localhost'`), Ollama (default).
- The UI loads nothing from the internet: fonts via @fontsource, icons and libraries bundled, Swagger UI assets local.
- The only outbound calls are to cloud AI providers the user enables.

## Workflow

- Phases in order (see `docs/PLAN.md` §10). Each phase ends runnable and verified: typecheck, lint and tests pass, the app
  boots, and new features have been exercised (API calls, scripts, browser screenshots). Then commit, tick PLAN.md,
  and summarize with how to try it.
- Stops for user review: end of Phase 0 (plan) and end of Phase 1 (design system + shell).
- Never commit `.env`, secrets or `data/uploads`. Don't deviate from the brief silently; propose changes.
- Windows first: Node scripts only (no bash-only scripts), `cross-env`, LF line endings via `.gitattributes`.
