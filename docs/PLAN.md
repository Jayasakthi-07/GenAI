# Stockroom — Implementation Plan

> Official title: **Automatic Inventory Management Using Agents**. Working product name: **Stockroom** (`APP_NAME` in `packages/shared`).
> Source of truth: [`docs/PROJECT_BRIEF.md`](./PROJECT_BRIEF.md). This plan refines it; where they differ, the brief wins unless a change is listed in §1 and approved.
> Status is tracked in the checklist in §10. Update it at the end of every phase.

---

## 0. Environment (checked 2026-09-26)

| Item       | Status                                             | Notes                                                                  |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| OS         | Windows 11 Pro (26200)                             | All scripts must be cross-platform Node scripts                        |
| Node.js    | **24.21.0** (LTS)                                  | OK                                                                     |
| pnpm       | **12.6.0**                                         | Installed this session with `npm i -g pnpm`                            |
| Git        | 2.55                                               | OK. **`user.name` / `user.email` are not set**                         |
| PostgreSQL | **Missing**                                        | Not installed, nothing listening on 5432                               |
| Ollama     | **Missing**                                        | Not installed, nothing listening on 11434                              |
| Hardware   | i7-14700HX, 40 GB RAM, RTX 4060 Laptop (8 GB VRAM) | Runs 7–9B models on the GPU comfortably; 14B at Q4 partially offloaded |

Current stable versions (npm, 2026-09-26) that the plan targets: React 19.3, Vite 8.3, Tailwind 4.3, TanStack Router 1.170 / Query 5.104 / Table 9.2 / Virtual 3.14, React Hook Form 7.89, Zod 4.6, Recharts 3.10, Motion 13.4, cmdk 1.1, Sonner 2.0, lucide-react 1.48, date-fns 4.4, shadcn CLI 4.21, radix-ui 1.6, Fastify 5.12, fastify-type-provider-zod 7.0, Prisma **7.10**, pg-boss 12.35, Pino 10.3, @google/genai 2.24, Vitest 5.0, Playwright 1.63, ESLint 10.11, typescript-eslint 8.70, Prettier 3.9, TypeScript **6.0.x**.

Library APIs that changed across major versions since common training data and **must be read from current docs before use**: TanStack Table v9, Prisma 7 (config file + driver adapters), pg-boss 12, Vite 8 (Rolldown), Vitest 5, ESLint 10 flat config, Tailwind v4 (CSS-first `@theme`), lucide-react 1.x, Motion 13, @google/genai 2.x, pnpm 12 build-script approval.

---

## 1. Proposed changes and clarifications to the brief

Each item needs your OK (or objection) at the Phase 0 review.

1. **TypeScript 6.0.x, not 7.0.** npm `latest` is now TypeScript 7 (the native Go compiler), but `typescript-eslint` supports only `typescript <6.1`, and type-aware linting is part of the quality bar. Pin `typescript@~6.0`; revisit when typescript-eslint supports 7.
2. **Prisma 7.10, not npm `latest`.** Prisma's `latest` tag currently points at `8.0.0-rc.17` (a release candidate). Use stable 7.10: `prisma.config.ts`, the `prisma-client` generator with an explicit output folder, and the `@prisma/adapter-pg` driver adapter (no Rust engine download).
3. **`@node-rs/argon2` instead of `argon2`.** Same Argon2id algorithm, prebuilt N-API binaries, no node-gyp / Visual Studio Build Tools. It also works with pnpm's default block on dependency install scripts.
4. **TanStack Router** (the brief allows either): typed routes and typed search params (good for table filters in the URL), plus file-based route code-splitting through the Vite plugin.
5. **PDF with `@react-pdf/renderer` on the server**, using the bundled Inter font. Works offline, no headless browser. **Excel with `write-excel-file`**: the `xlsx` package on npm is abandoned and `exceljs` has had no release since 2023.
6. **The Playwright smoke test uses the installed Microsoft Edge** (`channel: 'msedge'`), so no browser download is needed.
7. **Outputs vs actions** (clarifies "write tools never mutate directly"):
   - _Outputs_ are informational and recorded directly by the run: alerts, forecasts, findings, scorecards, classifications and reports.
   - _Actions_ change operational state and **always** go through an `AgentAction` proposal, which is gated by autonomy level and limits. Actions are: create PO, create transfer, change reorder parameters, create cycle count, markdown price, change preferred supplier.
   - Without this split, a `recommend`-level Stock Sentinel would need approval for every alert.
8. **Integer quantities in the product's stocking unit** (pcs, pack, 5 kg bag, case, and so on). Units are names only. Fractional quantities are out of scope. This avoids decimal-quantity bugs in the ledger and forecasts, and is normal for a distributor.
9. **Optimizer "markdowns/bundles":** markdown proposals execute as a real selling-price change (audited, with the original price kept for rollback). Bundles appear only as written suggestions in findings, with no bundle-SKU entity. Tell me if you want real bundles.
10. **Single organization.** One company per install, with an `Organization` settings row. No multi-tenancy (this is a local app).
11. **Localhost binding everywhere.** Fastify and Vite bind to `127.0.0.1` explicitly. Vite's default `localhost` can resolve to `::1` on Node 24. PostgreSQL's Windows installer defaults to `listen_addresses = '*'`; the setup guide changes it to `'localhost'`.
12. **Build:** `packages/shared` is consumed as TypeScript source, with no build step of its own. The server runs with `tsx watch` in development and is bundled with **tsdown** (Rolldown) for `pnpm build`. Fastify serves `apps/web/dist` from the same port.
13. **Daily rollup tables.** `SalesDaily` is written in the same transaction as each sale or return. `InventorySnapshot` is written nightly and backfilled by the seed. They keep dashboards, forecasting and analytics to aggregate queries with no N+1 queries and no full-ledger scans.
14. **Database sessions.** A random 256-bit token in an httpOnly `SameSite=Lax` cookie; only its SHA-256 is stored. Sessions are revocable (logout, password change, user deactivation). No JWTs.
15. **Simulator timing.** The simulator records sales at real timestamps at an accelerated rate, so "today" absorbs a festive rush. That is what makes Sentinel and the Anomaly Auditor react visibly. Supplier lead times in the simulator are scaled (1 simulated day = N seconds, adjustable). In demo mode, approved POs are auto-sent and auto-received after the scaled lead time. That gives the brief's "no manual steps in between" flow.
16. **Uploaded product images** are stored in `data/uploads/` (gitignored) and served by Fastify. The seed uses generated neutral placeholder tiles (category initial on a tinted square), not stock photos.

---

## 2. Architecture

```
┌──────────────── Browser (React SPA, Vite) ────────────────┐
│ TanStack Router · Query · Table · RHF+Zod · Recharts      │
│ SSE client → query invalidation map                       │
└──────────────┬───────────────────────────┬────────────────┘
          REST /api/v1                 SSE /api/v1/events
┌──────────────▼───────────────────────────▼────────────────┐
│ Fastify (127.0.0.1)  plugins: env, prisma, auth/RBAC,     │
│ error envelope, helmet, CORS, rate-limit, swagger, static │
│  routes (thin) ──► services (all business rules) ──► Prisma ──► PostgreSQL
│                     ▲      │ emit                                (public + pgboss schemas)
│              tools  │      ▼
│  Agent runtime ─────┘   Domain event bus ──► SSE hub
│   ▲   │                        │
│   │   └─► LLM gateway          └──► Orchestrator (debounce, hand-offs)
│   │        ├ router (default/override/fallback, prefer-local)     │
│   │        ├ budgets (RPM, concurrency, daily) + retry/backoff    │
│   │        └ adapters: Ollama · OpenAI-compatible · Gemini · Mock │
│   └──────── pg-boss (cron schedules, per-agent singleton queues) ◄┘
│  Analytics (pure functions): forecast · reorder · anomaly · ABC–XYZ · supplier score
└───────────────────────────────────────────────────────────┘
```

**Rules** (brief §4, restated as enforceable conventions):

- Routes parse input and output with Zod, call exactly one service method, and return. No Prisma in routes.
- Services own validation beyond shape, invariants, permissions (`ctx.can(...)`), audit, and events. Every service method takes an `ActorContext` (`{ type: 'user', userId, role } | { type: 'agent', agentKey, runId } | { type: 'system' | 'simulator' }`).
- Agent tools are adapters over services. Agents never import Prisma.
- `InventoryService.recordMovement()` is the only code path that changes `StockLevel.onHand` or batch quantities. It runs in a serializable transaction with row locks (`SELECT … FOR UPDATE`), writes the ledger row with `balanceAfter`, updates moving-average cost on receipts, refuses to go negative (`INSUFFICIENT_STOCK`), and updates `SalesDaily` for sales and returns. A DB `CHECK` constraint is the backstop.
- The audit entry is written inside the same transaction as the mutation. Domain events are emitted **after commit**.
- Money is `Decimal` in the DB, `decimal.js` in services, and a string in JSON. Integer quantities.
- `analytics/` is pure (no I/O) and fully unit-tested. Services feed it data; agents read its results through tools.

### Realtime

The event bus is typed (`stock.changed`, `sale.recorded`, `po.status_changed`, `po.received`, `alert.created|updated`, `action.created|decided|executed`, `agent.run.queued|started|step|finished`, `notification.created`, `simulation.state`, `ai.status`). The SSE hub filters events by role and sends a heartbeat every 15 s. On the client, one `EventSource` feeds an invalidation map (event → TanStack Query keys) plus live stores (agent activity, run timelines, toasts).

---

## 3. Folder structure

```
.
├─ apps/
│  ├─ web/
│  │  ├─ index.html · vite.config.ts · tsconfig.json
│  │  └─ src/
│  │     ├─ main.tsx · router.tsx · routeTree.gen.ts (generated)
│  │     ├─ routes/                 file-based routes (__root, _app layout, login, design, …)
│  │     ├─ components/
│  │     │  ├─ ui/                  design-system primitives (restyled shadcn/Radix)
│  │     │  ├─ layout/              AppShell, Sidebar, TopBar, PageHeader, MobileDrawer
│  │     │  ├─ data-table/          DataTable (virtualized), toolbar, density, column menu, stacked-card mode
│  │     │  ├─ charts/              ChartCard, LineChart, AreaChart, BarChart, Donut, Sparkline, theme
│  │     │  ├─ ai/                  AiMarker, ModelChip, RunTimeline, StreamingText, StepStatus, ReasoningDisclosure
│  │     │  └─ feedback/            EmptyState, ErrorState, Skeletons, ConfirmDialog, UnsavedChangesGuard
│  │     ├─ features/<domain>/      api hooks (queries/mutations), forms, domain components
│  │     ├─ lib/                    api client, sse, query keys, format (en-IN money/qty/date), permissions
│  │     └─ styles/                 tokens.css (light/dark), globals.css, fonts.ts (@fontsource)
│  └─ server/
│     ├─ prisma/  schema.prisma · migrations/ · seed/ (generators, PRNG, scenarios)
│     ├─ prisma.config.ts · tsdown.config.ts · tsconfig.json
│     └─ src/
│        ├─ main.ts · app.ts (buildApp for tests)
│        ├─ config/        env.ts (Zod), constants
│        ├─ db/            client (PrismaPg adapter), tx helpers, sql/ (raw aggregate queries)
│        ├─ http/          plugins/ (auth, rbac, errors, sse, swagger, static), routes/<domain>.ts
│        ├─ services/      <domain>.service.ts (+ tests)
│        ├─ domain/        errors.ts, events.ts (bus), audit.ts, actor.ts, permissions.ts
│        ├─ analytics/     forecast/, reorder.ts, anomaly.ts, abcxyz.ts, supplier-score.ts, stats.ts (+ tests)
│        ├─ ai/
│        │  ├─ gateway/    types.ts, registry.ts, router.ts, budget.ts, retry.ts, crypto.ts, schema-sanitize.ts,
│        │  │              think.ts, adapters/{ollama,openai-compatible,gemini,mock}.ts
│        │  └─ agents/     runtime/ (loop, json-protocol, context, recorder, limits), tools/ (registry + tools),
│        │                 definitions/<agent>.ts (prompt, tools, analyzer, output schema), orchestrator.ts
│        ├─ jobs/          boss.ts, schedules.ts, workers.ts
│        ├─ realtime/      sse-hub.ts
│        ├─ reports/       briefing.ts, pdf/ (react-pdf documents: PO, report)
│        └─ simulation/    simulator.ts, scenarios.ts
├─ packages/shared/src/    schemas/<domain>.ts (Zod DTOs), constants (APP_NAME, roles, permissions,
│                          enums, reason codes), format/, types/
├─ scripts/                bootstrap.mjs, check-ledger.ts, reset-demo.ts, doctor.mjs (prereq check)
├─ e2e/                    Playwright smoke test (Phase 7)
├─ docs/                   PROJECT_BRIEF.md, PLAN.md, ARCHITECTURE.md, AGENTS.md, DEMO_SCRIPT.md
├─ data/                   uploads/ (gitignored)
├─ CLAUDE.md · README.md · .env.example · pnpm-workspace.yaml · package.json
└─ eslint.config.js · .prettierrc · tsconfig.base.json · vitest.workspace (or projects config)
```

**Root scripts:** `bootstrap`, `db:setup` (migrate + seed), `db:migrate`, `db:seed`, `db:reset`, `db:studio`, `dev` (server and web via `concurrently`), `build`, `start`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `check:ledger`, `doctor` (checks Node, pnpm, Postgres and Ollama with friendly output).

---

## 4. Data model — Prisma schema draft

Conventions: UUIDv7 primary keys (time-ordered, index-friendly); `snake_case` table and column names through `@@map`/`@map` (omitted below for brevity); `Decimal(14,2)` for money, `Decimal(14,4)` for unit costs; integer quantities. Constraints Prisma can't express (CHECKs, partial unique indexes, trigram search) go into hand-written SQL in the migration.

```prisma
// Prisma 7 — the connection URL lives in prisma.config.ts, the client uses @prisma/adapter-pg.
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}

datasource db {
  provider = "postgresql"
}

// ─────────────────────────── Shared enums ───────────────────────────
enum Role          { ADMIN MANAGER STAFF }
enum ActorType     { USER AGENT SYSTEM SIMULATOR }
enum Severity      { INFO LOW MEDIUM HIGH CRITICAL }
enum RiskLevel     { LOW MEDIUM HIGH }
enum ContentSource { AI RULE }

// ─────────────────────────── People & settings ───────────────────────────
model Organization {
  id        String   @id @default(uuid(7)) @db.Uuid
  name      String
  legalName String?
  gstin     String?
  address   String?
  currency  String   @default("INR") @db.Char(3)
  locale    String   @default("en-IN")
  timezone  String   @default("Asia/Kolkata")
  settings  Json     @default("{}") // briefingTime, serviceLevel, orderCost, holdingRate, dedupe windows, thresholds
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model User {
  id                 String    @id @default(uuid(7)) @db.Uuid
  email              String    @unique // stored lower-cased
  name               String
  passwordHash       String
  role               Role      @default(STAFF)
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(false)
  preferences        Json      @default("{}") // theme, density, notification prefs, onboarding state
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  sessions           Session[]
  notifications      Notification[]
  savedViews         SavedView[]
  conversations      ChatConversation[]
}

model Session {
  id         String   @id @default(uuid(7)) @db.Uuid
  tokenHash  String   @unique // sha256(token); the raw token only ever lives in the cookie
  userId     String   @db.Uuid
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userAgent  String?
  ip         String?
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([expiresAt])
}

model AppSetting { // singleton-ish JSON settings: "ai.routing", "simulation", "onboarding"
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}

model SavedView {
  id        String   @id @default(uuid(7)) @db.Uuid
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  page      String   // "products", "movements", …
  name      String
  state     Json     // filters, sort, visible columns, density
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  @@unique([userId, page, name])
}

// ─────────────────────────── Catalog ───────────────────────────
enum ProductStatus { ACTIVE INACTIVE DISCONTINUED }
enum AbcClass      { A B C }
enum XyzClass      { X Y Z }

model Unit {
  id       String    @id @default(uuid(7)) @db.Uuid
  code     String    @unique // "pcs", "pack", "kg5", "case12"
  name     String
  products Product[]
}

model Category {
  id          String     @id @default(uuid(7)) @db.Uuid
  name        String
  slug        String     @unique
  description String?
  parentId    String?    @db.Uuid
  parent      Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children    Category[] @relation("CategoryTree")
  sortOrder   Int        @default(0)
  products    Product[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@index([parentId])
}

model Product {
  id                  String        @id @default(uuid(7)) @db.Uuid
  sku                 String        @unique
  barcode             String?       @unique
  name                String
  description         String?
  categoryId          String        @db.Uuid
  category            Category      @relation(fields: [categoryId], references: [id])
  brand               String?
  unitId              String        @db.Uuid
  unit                Unit          @relation(fields: [unitId], references: [id])
  costPrice           Decimal       @db.Decimal(14, 2)
  sellingPrice        Decimal       @db.Decimal(14, 2)
  mrp                 Decimal?      @db.Decimal(14, 2)
  taxRate             Decimal       @default(0) @db.Decimal(5, 2) // GST %
  imagePath           String?
  tags                String[]      @default([])
  status              ProductStatus @default(ACTIVE)
  trackExpiry         Boolean       @default(false)
  shelfLifeDays       Int?
  reorderPoint        Int?
  safetyStock         Int?
  maxStock            Int?
  leadTimeDays        Int?
  abcClass            AbcClass?
  xyzClass            XyzClass?
  classifiedAt        DateTime?
  preferredSupplierId String?       @db.Uuid
  preferredSupplier   Supplier?     @relation("PreferredSupplier", fields: [preferredSupplierId], references: [id], onDelete: SetNull)
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  stockLevels     StockLevel[]
  batches         Batch[]
  movements       StockMovement[]
  supplierLinks   SupplierProduct[]
  poLines         PurchaseOrderLine[]
  soLines         SalesOrderLine[]
  forecasts       Forecast[]
  alerts          Alert[]
  salesDaily      SalesDaily[]
  transferLines   TransferLine[]
  countLines      CycleCountLine[]
  @@index([categoryId])
  @@index([status])
  @@index([abcClass, xyzClass])
  @@index([preferredSupplierId])
  // SQL: CREATE EXTENSION pg_trgm; GIN trigram index on (name, sku, barcode) for fast search
}

// ─────────────────────────── Stock ───────────────────────────
enum MovementType {
  OPENING_BALANCE RECEIPT SALE RETURN ADJUSTMENT WRITE_OFF TRANSFER_OUT TRANSFER_IN COUNT_CORRECTION
}
enum ReasonDirection { IN OUT BOTH }

model Warehouse {
  id        String   @id @default(uuid(7)) @db.Uuid
  code      String   @unique
  name      String
  city      String
  address   String?
  isActive  Boolean  @default(true)
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  stockLevels StockLevel[]
  batches     Batch[]
  movements   StockMovement[]
}

model StockLevel {
  id             String    @id @default(uuid(7)) @db.Uuid
  productId      String    @db.Uuid
  product        Product   @relation(fields: [productId], references: [id], onDelete: Restrict)
  warehouseId    String    @db.Uuid
  warehouse      Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  onHand         Int       @default(0)
  reserved       Int       @default(0) // confirmed-but-unfulfilled sales orders; available = onHand - reserved
  avgCost        Decimal   @default(0) @db.Decimal(14, 4) // moving average, updated on receipts
  lastMovementAt DateTime?
  updatedAt      DateTime  @updatedAt
  @@unique([productId, warehouseId])
  @@index([warehouseId])
  // SQL: CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)
}

model ReasonCode {
  id        String          @id @default(uuid(7)) @db.Uuid
  code      String          @unique // DAMAGED, EXPIRED, THEFT, FOUND, DATA_ENTRY, CUSTOMER_RETURN, …
  label     String
  direction ReasonDirection
  appliesTo MovementType[]
  isActive  Boolean         @default(true)
  sortOrder Int             @default(0)
  movements StockMovement[]
}

model StockMovement { // the ledger — append-only
  id           String       @id @default(uuid(7)) @db.Uuid
  productId    String       @db.Uuid
  product      Product      @relation(fields: [productId], references: [id], onDelete: Restrict)
  warehouseId  String       @db.Uuid
  warehouse    Warehouse    @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  batchId      String?      @db.Uuid
  batch        Batch?       @relation(fields: [batchId], references: [id], onDelete: SetNull)
  type         MovementType
  quantity     Int          // signed: + in, − out
  balanceAfter Int
  unitCost     Decimal      @db.Decimal(14, 4)
  reasonCodeId String?      @db.Uuid
  reasonCode   ReasonCode?  @relation(fields: [reasonCodeId], references: [id])
  reference    String?      // human reference, e.g. "PO-2026-00412"
  sourceType   String?      // PurchaseOrder | GoodsReceipt | SalesOrder | Transfer | CycleCount | Manual
  sourceId     String?      @db.Uuid
  note         String?
  actorType    ActorType
  actorUserId  String?      @db.Uuid
  agentRunId   String?      @db.Uuid
  occurredAt   DateTime     @default(now())
  createdAt    DateTime     @default(now())
  @@index([productId, warehouseId, occurredAt])
  @@index([warehouseId, occurredAt])
  @@index([type, occurredAt])
  @@index([sourceType, sourceId])
  @@index([occurredAt])
}

model Batch {
  id             String          @id @default(uuid(7)) @db.Uuid
  productId      String          @db.Uuid
  product        Product         @relation(fields: [productId], references: [id], onDelete: Restrict)
  warehouseId    String          @db.Uuid
  warehouse      Warehouse       @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  batchNo        String
  manufacturedOn DateTime?       @db.Date
  expiryDate     DateTime?       @db.Date
  quantity       Int             // remaining; Σ batches = StockLevel.onHand for trackExpiry products
  unitCost       Decimal         @db.Decimal(14, 4)
  receivedAt     DateTime        @default(now())
  movements      StockMovement[]
  @@unique([productId, warehouseId, batchNo])
  @@index([productId, warehouseId, expiryDate]) // FEFO lookups
  @@index([expiryDate])
  // SQL: CHECK (quantity >= 0)
}

model SalesDaily { // rollup maintained inside recordMovement() for SALE/RETURN
  productId   String   @db.Uuid
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  warehouseId String   @db.Uuid
  date        DateTime @db.Date
  quantity    Int
  revenue     Decimal  @db.Decimal(14, 2)
  cogs        Decimal  @db.Decimal(14, 2)
  orders      Int
  @@id([productId, warehouseId, date])
  @@index([date])
}

model InventorySnapshot { // nightly job + seed backfill; powers value trend & turnover
  date            DateTime @db.Date
  warehouseId     String   @db.Uuid
  totalUnits      Int
  totalValue      Decimal  @db.Decimal(16, 2)
  skuCount        Int
  lowStockCount   Int
  outOfStockCount Int
  @@id([date, warehouseId])
}

// ─────────────────────────── Purchasing ───────────────────────────
enum PurchaseOrderStatus {
  DRAFT PENDING_APPROVAL APPROVED SENT PARTIALLY_RECEIVED RECEIVED CLOSED CANCELLED
}

model Supplier {
  id               String     @id @default(uuid(7)) @db.Uuid
  code             String     @unique
  name             String
  contactName      String?
  email            String?
  phone            String?
  city             String?
  address          String?
  gstin            String?
  paymentTermsDays Int        @default(30)
  isActive         Boolean    @default(true)
  notes            String?
  score            Decimal?   @db.Decimal(5, 2) // 0–100, from Supplier Analyst
  scoreBreakdown   Json?      // onTime, fillRate, leadTimeCv, priceTrend, quality + raw metrics
  riskLevel        RiskLevel?
  scoredAt         DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  catalog          SupplierProduct[]
  purchaseOrders   PurchaseOrder[]
  preferredFor     Product[]  @relation("PreferredSupplier")
  alerts           Alert[]
}

model SupplierProduct {
  id           String   @id @default(uuid(7)) @db.Uuid
  supplierId   String   @db.Uuid
  supplier     Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  productId    String   @db.Uuid
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  supplierSku  String?
  unitCost     Decimal  @db.Decimal(14, 2)
  moq          Int      @default(1)
  packSize     Int      @default(1)
  leadTimeDays Int
  isActive     Boolean  @default(true)
  updatedAt    DateTime @updatedAt
  @@unique([supplierId, productId])
  @@index([productId])
}

model PurchaseOrder {
  id            String              @id @default(uuid(7)) @db.Uuid
  number        String              @unique // PO-2026-00412
  supplierId    String              @db.Uuid
  supplier      Supplier            @relation(fields: [supplierId], references: [id])
  warehouseId   String              @db.Uuid
  status        PurchaseOrderStatus @default(DRAFT)
  orderDate     DateTime            @default(now())
  expectedDate  DateTime?           @db.Date
  subtotal      Decimal             @db.Decimal(14, 2)
  taxTotal      Decimal             @db.Decimal(14, 2)
  total         Decimal             @db.Decimal(14, 2)
  notes         String?
  rationale     String?             // agent-drafted POs: overall rationale (shown with AI marker)
  createdByType ActorType
  createdById   String?             @db.Uuid
  agentRunId    String?             @db.Uuid
  agentActionId String?             @unique @db.Uuid
  submittedAt   DateTime?
  approvedById  String?             @db.Uuid
  approvedAt    DateTime?
  sentAt        DateTime?
  receivedAt    DateTime?
  closedAt      DateTime?
  cancelledAt   DateTime?
  cancelReason  String?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  lines         PurchaseOrderLine[]
  receipts      GoodsReceipt[]
  @@index([status])
  @@index([supplierId, orderDate])
  @@index([warehouseId, status])
}

model PurchaseOrderLine {
  id               String        @id @default(uuid(7)) @db.Uuid
  purchaseOrderId  String        @db.Uuid
  purchaseOrder    PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  productId        String        @db.Uuid
  product          Product       @relation(fields: [productId], references: [id])
  quantityOrdered  Int
  quantityReceived Int           @default(0)
  quantityRejected Int           @default(0)
  unitCost         Decimal       @db.Decimal(14, 2)
  taxRate          Decimal       @default(0) @db.Decimal(5, 2)
  lineTotal        Decimal       @db.Decimal(14, 2)
  rationale        String?       // per-line agent rationale
  receiptLines     GoodsReceiptLine[]
  @@index([purchaseOrderId])
  @@index([productId])
}

model GoodsReceipt {
  id              String        @id @default(uuid(7)) @db.Uuid
  number          String        @unique // GRN-2026-00188
  purchaseOrderId String        @db.Uuid
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  warehouseId     String        @db.Uuid
  receivedAt      DateTime      @default(now())
  actorType       ActorType
  receivedById    String?       @db.Uuid
  notes           String?
  lines           GoodsReceiptLine[]
  @@index([purchaseOrderId])
  @@index([receivedAt])
}

model GoodsReceiptLine {
  id                  String            @id @default(uuid(7)) @db.Uuid
  goodsReceiptId      String            @db.Uuid
  goodsReceipt        GoodsReceipt      @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  purchaseOrderLineId String            @db.Uuid
  purchaseOrderLine   PurchaseOrderLine @relation(fields: [purchaseOrderLineId], references: [id])
  productId           String            @db.Uuid
  quantityReceived    Int
  quantityRejected    Int               @default(0)
  rejectReason        String?
  unitCost            Decimal           @db.Decimal(14, 2) // invoiced cost; mismatches feed the Anomaly Auditor
  batchNo             String?
  expiryDate          DateTime?         @db.Date
}

// ─────────────────────────── Sales ───────────────────────────
enum CustomerType     { RETAIL WHOLESALE ONLINE }
enum SalesChannel     { STORE WHOLESALE ONLINE }
enum SalesOrderStatus { DRAFT CONFIRMED PARTIALLY_FULFILLED FULFILLED CANCELLED }

model Customer {
  id        String       @id @default(uuid(7)) @db.Uuid
  code      String       @unique
  name      String
  type      CustomerType
  email     String?
  phone     String?
  city      String?
  gstin     String?
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  orders    SalesOrder[]
}

model SalesOrder {
  id            String           @id @default(uuid(7)) @db.Uuid
  number        String           @unique // SO-2026-08812
  customerId    String?          @db.Uuid
  customer      Customer?        @relation(fields: [customerId], references: [id])
  warehouseId   String           @db.Uuid
  channel       SalesChannel
  status        SalesOrderStatus @default(DRAFT)
  orderDate     DateTime         @default(now())
  fulfilledAt   DateTime?
  subtotal      Decimal          @db.Decimal(14, 2)
  discountTotal Decimal          @default(0) @db.Decimal(14, 2)
  taxTotal      Decimal          @db.Decimal(14, 2)
  total         Decimal          @db.Decimal(14, 2)
  notes         String?
  createdByType ActorType
  createdById   String?          @db.Uuid
  isSimulated   Boolean          @default(false)
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  lines         SalesOrderLine[]
  @@index([status])
  @@index([orderDate])
  @@index([customerId, orderDate])
  @@index([warehouseId, orderDate])
}

model SalesOrderLine {
  id                String     @id @default(uuid(7)) @db.Uuid
  salesOrderId      String     @db.Uuid
  salesOrder        SalesOrder @relation(fields: [salesOrderId], references: [id], onDelete: Cascade)
  productId         String     @db.Uuid
  product           Product    @relation(fields: [productId], references: [id])
  quantity          Int
  quantityFulfilled Int        @default(0)
  unitPrice         Decimal    @db.Decimal(14, 2)
  discount          Decimal    @default(0) @db.Decimal(14, 2)
  taxRate           Decimal    @default(0) @db.Decimal(5, 2)
  lineTotal         Decimal    @db.Decimal(14, 2)
  @@index([salesOrderId])
  @@index([productId])
}

// ─────────────────────────── Operations ───────────────────────────
enum TransferStatus   { DRAFT IN_TRANSIT RECEIVED CANCELLED }
enum CycleCountStatus { OPEN IN_REVIEW COMPLETED CANCELLED }
enum CountLineStatus  { PENDING COUNTED ACCEPTED RECOUNT }

model Transfer {
  id              String         @id @default(uuid(7)) @db.Uuid
  number          String         @unique // TRF-2026-00031
  fromWarehouseId String         @db.Uuid
  toWarehouseId   String         @db.Uuid
  status          TransferStatus @default(DRAFT)
  reason          String?
  createdByType   ActorType
  createdById     String?        @db.Uuid
  agentActionId   String?        @unique @db.Uuid
  shippedAt       DateTime?
  receivedAt      DateTime?
  cancelledAt     DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  lines           TransferLine[]
  @@index([status])
}

model TransferLine {
  id         String   @id @default(uuid(7)) @db.Uuid
  transferId String   @db.Uuid
  transfer   Transfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  productId  String   @db.Uuid
  product    Product  @relation(fields: [productId], references: [id])
  quantity   Int
  batchId    String?  @db.Uuid
}

model CycleCount {
  id            String           @id @default(uuid(7)) @db.Uuid
  number        String           @unique // CC-2026-00017
  warehouseId   String           @db.Uuid
  status        CycleCountStatus @default(OPEN)
  reason        String?
  dueDate       DateTime?        @db.Date
  createdByType ActorType
  createdById   String?          @db.Uuid
  agentActionId String?          @unique @db.Uuid
  submittedAt   DateTime?
  completedAt   DateTime?
  approvedById  String?          @db.Uuid
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  lines         CycleCountLine[]
  @@index([status])
}

model CycleCountLine {
  id            String          @id @default(uuid(7)) @db.Uuid
  cycleCountId  String          @db.Uuid
  cycleCount    CycleCount      @relation(fields: [cycleCountId], references: [id], onDelete: Cascade)
  productId     String          @db.Uuid
  product       Product         @relation(fields: [productId], references: [id])
  expectedQty   Int             // snapshot when counting starts
  countedQty    Int?
  variance      Int?
  varianceValue Decimal?        @db.Decimal(14, 2)
  status        CountLineStatus @default(PENDING)
  note          String?
  countedById   String?         @db.Uuid
  countedAt     DateTime?
  @@unique([cycleCountId, productId])
}

// ─────────────────────────── Intelligence ───────────────────────────
enum ForecastMethod { HOLT_WINTERS CROSTON_SBA SES MOVING_AVERAGE }
enum DemandPattern  { SMOOTH ERRATIC INTERMITTENT LUMPY }
enum AlertType {
  LOW_STOCK OUT_OF_STOCK OVERSTOCK PROJECTED_STOCKOUT EXPIRING_BATCH
  DEMAND_SPIKE ANOMALY SUPPLIER_RISK FORECAST_SHIFT DEAD_STOCK SYSTEM
}
enum AlertStatus { OPEN ACKNOWLEDGED SNOOZED RESOLVED }

model Forecast {
  id             String         @id @default(uuid(7)) @db.Uuid
  productId      String         @db.Uuid
  product        Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  warehouseId    String?        @db.Uuid // null = all warehouses
  method         ForecastMethod
  demandPattern  DemandPattern
  horizonDays    Int
  historyDays    Int
  params         Json           // alpha, beta, gamma, phi, season length, …
  points         Json           // [{ date, yhat, lo, hi }]
  avgDailyDemand Decimal        @db.Decimal(12, 4)
  demandStdDev   Decimal        @db.Decimal(12, 4)
  mape           Decimal?       @db.Decimal(7, 2) // holdout backtest
  wape           Decimal?       @db.Decimal(7, 2) // robust for intermittent demand
  isLatest       Boolean        @default(true)
  agentRunId     String?        @db.Uuid
  generatedAt    DateTime       @default(now())
  @@index([productId, isLatest])
  @@index([generatedAt])
}

model Alert {
  id                String        @id @default(uuid(7)) @db.Uuid
  type              AlertType
  severity          Severity
  status            AlertStatus   @default(OPEN)
  priority          Int           // 0–100, deterministic score, AI may re-rank within bounds
  title             String
  message           String        // deterministic facts ("12 units left, 3.1 days of cover, lead time 7 days")
  explanation       String?       // AI (or rule template) explanation
  explanationSource ContentSource
  modelUsed         String?
  productId         String?       @db.Uuid
  product           Product?      @relation(fields: [productId], references: [id], onDelete: Cascade)
  warehouseId       String?       @db.Uuid
  supplierId        String?       @db.Uuid
  supplier          Supplier?     @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  batchId           String?       @db.Uuid
  data              Json          // metrics used ("data used" in the UI)
  dedupeKey         String
  agentRunId        String?       @db.Uuid
  snoozedUntil      DateTime?
  acknowledgedById  String?       @db.Uuid
  acknowledgedAt    DateTime?
  resolvedById      String?       @db.Uuid
  resolvedAt        DateTime?
  resolution        String?
  autoResolved      Boolean       @default(false)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  @@index([status, severity, createdAt])
  @@index([productId])
  @@index([type, status])
  // SQL: CREATE UNIQUE INDEX alert_open_dedupe ON alert (dedupe_key) WHERE status <> 'RESOLVED'
}

model Notification {
  id            String    @id @default(uuid(7)) @db.Uuid
  userId        String    @db.Uuid
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  type          String    // alert | approval | run_failed | po_received | report_ready
  title         String
  body          String?
  link          String?
  severity      Severity?
  readAt        DateTime?
  createdAt     DateTime  @default(now())
  @@index([userId, readAt, createdAt])
}

// ─────────────────────────── Agents ───────────────────────────
enum Autonomy     { OBSERVE RECOMMEND ACT }
enum RunTrigger   { SCHEDULE EVENT MANUAL CHAT HANDOFF }
enum RunStatus    { QUEUED RUNNING SUCCEEDED NO_CHANGE FAILED CANCELLED }
enum RunMode      { AI RULE_BASED }
enum StepType     { CONTEXT ANALYSIS LLM_CALL TOOL_CALL THINKING VALIDATION_ERROR HANDOFF FINAL ERROR }
enum ActionType   {
  CREATE_PURCHASE_ORDER CREATE_TRANSFER UPDATE_REORDER_PARAMS CREATE_CYCLE_COUNT
  MARKDOWN_PRICE CHANGE_PREFERRED_SUPPLIER
}
enum ActionStatus { PENDING APPROVED EXECUTED REJECTED FAILED EXPIRED }

model AgentDefinition {
  id            String      @id @default(uuid(7)) @db.Uuid
  key           String      @unique // stock_sentinel, demand_forecaster, …
  name          String
  description   String
  systemPrompt  String
  allowedTools  String[]
  triggers      Json        // { cron: ["*/15 * * * *"], events: ["stock.changed"], debounceMs, manual, chat }
  autonomy      Autonomy    @default(RECOMMEND)
  modelOverride Json?       // { providerKey, modelId }
  limits        Json        // { maxSteps, maxToolCalls, timeoutMs, maxActionsPerRun, maxPoValue }
  config        Json        // agent-specific tunables (service level, budget, thresholds)
  isEnabled     Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  runs          AgentRun[]
  actions       AgentAction[]
}

model AgentRun {
  id               String          @id @default(uuid(7)) @db.Uuid
  agentId          String          @db.Uuid
  agent            AgentDefinition @relation(fields: [agentId], references: [id], onDelete: Cascade)
  trigger          RunTrigger
  triggerDetail    Json?           // event name + payload summary, hand-off source, user id
  status           RunStatus       @default(QUEUED)
  mode             RunMode?
  providerKey      String?         // what actually served the run
  modelId          String?
  parentRunId      String?         @db.Uuid // hand-offs
  fingerprint      String?         // hash of deterministic findings → "no change" detection
  startedAt        DateTime?
  finishedAt       DateTime?
  durationMs       Int?
  promptTokens     Int?
  completionTokens Int?
  stepCount        Int             @default(0)
  toolCallCount    Int             @default(0)
  summary          String?
  output           Json?           // validated final output { summary, findings[], actions[] }
  error            Json?
  createdAt        DateTime        @default(now())
  steps            AgentStep[]
  actions          AgentAction[]
  @@index([agentId, createdAt(sort: Desc)])
  @@index([status])
  @@index([parentRunId])
}

model AgentStep {
  id         String   @id @default(uuid(7)) @db.Uuid
  runId      String   @db.Uuid
  run        AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  seq        Int
  type       StepType
  label      String   // "Checking stock levels…", "Comparing 3 suppliers…"
  toolName   String?
  input      Json?    // tool args / messages sent (truncated)
  output     Json?    // tool result / model response (truncated)
  content    String?
  reasoning  String?  // separated <think>/reasoning content, shown collapsed
  error      Json?
  llmCallId  String?  @db.Uuid
  startedAt  DateTime @default(now())
  durationMs Int?
  @@unique([runId, seq])
}

model AgentAction { // proposals
  id              String          @id @default(uuid(7)) @db.Uuid
  runId           String?         @db.Uuid // null when created from Assistant confirmation outside a run
  run             AgentRun?       @relation(fields: [runId], references: [id], onDelete: SetNull)
  agentId         String          @db.Uuid
  agent           AgentDefinition @relation(fields: [agentId], references: [id], onDelete: Cascade)
  type            ActionType
  status          ActionStatus    @default(PENDING)
  title           String
  summary         String
  rationale       String
  rationaleSource ContentSource
  modelUsed       String?
  payload         Json            // Zod-validated per ActionType
  editedPayload   Json?           // edit-and-approve
  expectedImpact  Json            // { cost, daysOfCoverGained, valueRecovered, riskReduced }
  dataUsed        Json            // citations: which tools/results backed the proposal
  riskLevel       RiskLevel
  dedupeKey       String
  autoExecuted    Boolean         @default(false)
  decidedById     String?         @db.Uuid
  decidedAt       DateTime?
  decisionReason  String?
  executedAt      DateTime?
  result          Json?           // e.g. { purchaseOrderId, number }
  error           Json?
  expiresAt       DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  @@index([status, createdAt])
  @@index([agentId, createdAt])
  // SQL: CREATE UNIQUE INDEX action_open_dedupe ON agent_action (dedupe_key) WHERE status IN ('PENDING','APPROVED')
}

// ─────────────────────────── AI gateway ───────────────────────────
enum ProviderKind   { OLLAMA OPENAI_COMPATIBLE GEMINI MOCK }
enum ProviderHealth { CONNECTED INVALID_KEY RATE_LIMITED OFFLINE UNKNOWN }
enum LlmCallStatus  { SUCCESS ERROR RATE_LIMITED TIMEOUT INVALID_KEY BUDGET_EXCEEDED CANCELLED }
enum LlmPurpose     { AGENT CHAT PROBE CONNECTION_TEST LATENCY_TEST }

model ProviderConfig {
  id                     String         @id @default(uuid(7)) @db.Uuid
  key                    String         @unique // ollama, gemini, openrouter, groq, nvidia, cerebras, mistral, github, huggingface, lmstudio, custom-*
  kind                   ProviderKind
  displayName            String
  baseUrl                String
  apiKeyCiphertext       Bytes?         // AES-256-GCM (iv | tag | ciphertext) with APP_ENCRYPTION_KEY
  apiKeyLast4            String?
  extraHeadersCiphertext Bytes?
  isEnabled              Boolean        @default(false)
  isCustom               Boolean        @default(false)
  settings               Json           // rpm, concurrency, dailyBudget, timeoutMs, numCtx, keepAlive, disableThinking
  health                 ProviderHealth @default(UNKNOWN)
  healthMessage          String?
  healthCheckedAt        DateTime?
  latencyMs              Int?
  sortOrder              Int            @default(0)
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
}

model ModelCapability { // reported by the provider, or learned by a one-click probe
  providerKey   String
  modelId       String
  capabilities  Json     // { tools, vision, thinking, embedding, structuredOutput }
  contextWindow Int?
  source        String   // REPORTED | PROBED
  probedAt      DateTime @default(now())
  @@id([providerKey, modelId])
}

model LlmCall {
  id               String        @id @default(uuid(7)) @db.Uuid
  providerKey      String
  modelId          String
  purpose          LlmPurpose
  agentKey         String?
  runId            String?       @db.Uuid
  status           LlmCallStatus
  errorCode        String?
  errorMessage     String?       // sanitized; never contains keys
  promptTokens     Int?
  completionTokens Int?
  latencyMs        Int
  attempt          Int           @default(1)
  isFallback       Boolean       @default(false)
  startedAt        DateTime      @default(now())
  @@index([startedAt])
  @@index([providerKey, startedAt])
  @@index([runId])
}

model ChatConversation {
  id        String        @id @default(uuid(7)) @db.Uuid
  userId    String        @db.Uuid
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  messages  ChatMessage[]
  @@index([userId, updatedAt])
}

model ChatMessage {
  id             String           @id @default(uuid(7)) @db.Uuid
  conversationId String           @db.Uuid
  conversation   ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String           // user | assistant
  content        String
  parts          Json?            // tables, charts, confirmation cards, citations
  runId          String?          @db.Uuid // Assistant turns are AgentRuns (trigger CHAT) → full trace
  modelUsed      String?
  createdAt      DateTime         @default(now())
  @@index([conversationId, createdAt])
}

enum ReportType { DAILY_BRIEFING WEEKLY_SUMMARY }

model Report {
  id              String        @id @default(uuid(7)) @db.Uuid
  type            ReportType
  title           String
  periodStart     DateTime
  periodEnd       DateTime
  content         Json          // { kpis, changes, risks, agentActivity, pendingDecisions, narrative }
  narrativeSource ContentSource
  modelUsed       String?
  runId           String?       @db.Uuid
  createdAt       DateTime      @default(now())
  @@index([type, createdAt])
}

model AuditLog {
  id          String    @id @default(uuid(7)) @db.Uuid
  actorType   ActorType
  actorUserId String?   @db.Uuid
  agentKey    String?
  agentRunId  String?   @db.Uuid
  action      String    // "product.update", "po.approve", "stock.adjust", "ai.provider.update", …
  entityType  String
  entityId    String?
  summary     String?
  before      Json?     // secrets are redacted before writing
  after       Json?
  ip          String?
  createdAt   DateTime  @default(now())
  @@index([entityType, entityId])
  @@index([actorUserId, createdAt])
  @@index([agentRunId])
  @@index([action, createdAt])
  @@index([createdAt])
}
```

**Invariant checks** (`pnpm check:ledger` + a Vitest integration test):

1. For every `StockLevel`, `onHand = Σ StockMovement.quantity` for that product × warehouse.
2. The latest movement's `balanceAfter` equals `onHand`.
3. For `trackExpiry` products, `Σ Batch.quantity = onHand`.
4. `SalesDaily` equals the grouped SALE/RETURN movements.
5. No PO line has `quantityReceived + quantityRejected > quantityOrdered`.

---

## 5. Domain services (business rules live here)

`AuthService` · `UserService` · `SettingsService` · `CatalogService` (categories, units, products, import/export, saved views) · `InventoryService` (`recordMovement`, receive, issue, adjust, write-off, FEFO allocation, batches) · `TransferService` · `CycleCountService` · `SupplierService` · `PurchaseOrderService` (state machine, receiving, totals) · `SalesOrderService` (reserve on confirm, FEFO issue on fulfill) · `AlertService` (dedupe, snooze, auto-resolve when the condition clears) · `NotificationService` · `AuditService` · `DashboardService` · `AnalyticsService` · `ForecastService` · `ReportService` · `ActionService` (proposal lifecycle and executors per `ActionType`) · `AgentService` (definitions, runs) · `AiService` (providers, models, routing, usage) · `SearchService` · `SimulationService` · `DemoDataService` (reset).

**PO state machine:** `DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED`. `CANCELLED` is allowed from any state before the first receipt. POs above a configurable value always need Manager or Admin approval, even when drafted by a human. Invalid transitions throw `INVALID_STATE_TRANSITION`.

**RBAC** (permissions are defined in `packages/shared`, enforced by `ctx.can()` in services and `requirePermission` on routes, and mirrored in the UI):

| Capability                                                      | Admin | Manager |        Staff        |
| --------------------------------------------------------------- | :---: | :-----: | :-----------------: |
| View everything (except AI keys and users)                      |   ✓   |    ✓    |          ✓          |
| Stock ops (receive, issue, adjust ≤ threshold, transfer, count) |   ✓   |    ✓    |          ✓          |
| Adjustments above threshold / write-offs / count approval       |   ✓   |    ✓    |          –          |
| Products, suppliers, customers, catalog                         |   ✓   |    ✓    |        view         |
| Create POs / SOs                                                |   ✓   |    ✓    | ✓ (PO = draft only) |
| Approve POs and agent proposals                                 |   ✓   |    ✓    |          –          |
| Agents: run now                                                 |   ✓   |    ✓    |          –          |
| Agents: edit prompt, autonomy, schedule, model                  |   ✓   |    ✓    |          –          |
| AI providers and keys, users, organization, reset demo          |   ✓   |    –    |          –          |
| Simulation panel                                                |   ✓   |    ✓    |          –          |
| Audit log                                                       |   ✓   |    ✓    |          –          |

---

## 6. AI layer — LLM gateway

**Interface:** as in the brief, §5. Core types (`ChatRequest`, `ChatResponse`, `ChatChunk`, `ToolSpec`, `ModelInfo`, `ProviderHealth`) live in `ai/gateway/types.ts`. Adapters convert to and from provider formats. Nothing outside `ai/` imports an adapter.

| Adapter               | Details (verify against current docs in Phase 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ollama** (native)   | `GET /api/version`, `/api/tags`, `POST /api/show` (`capabilities`: `completion`, `tools`, `thinking`, `vision`, `embedding`; context length from `model_info["<arch>.context_length"]`), `GET /api/ps`; `POST /api/chat` with `tools`, `stream`, `keep_alive`, `options.num_ctx` (default 8192, configurable), `think` (bool or level). Reads `message.thinking` and `message.tool_calls[].function.arguments` (an object). NDJSON streaming. Concurrency 1.                                                                                                                                                                             |
| **OpenAI-compatible** | One adapter plus presets. OpenRouter `https://openrouter.ai/api/v1` (`/models`; free = `:free` suffix or zero pricing; tools from `supported_parameters`; quota via `GET /api/v1/key` → `free_model_daily_requests`). NVIDIA NIM `https://integrate.api.nvidia.com/v1`. Groq `https://api.groq.com/openai/v1`. Cerebras `https://api.cerebras.ai/v1`. Mistral `https://api.mistral.ai/v1`. GitHub Models `https://models.github.ai/inference`. Hugging Face `https://router.huggingface.co/v1`. LM Studio `http://127.0.0.1:1234/v1`. Custom endpoints. SSE streaming, tool-call delta assembly, `reasoning`/`reasoning_content` fields. |
| **Gemini**            | `@google/genai` (native function calling, `thinkingConfig`). The schema sanitizer strips unsupported JSON Schema keywords (`additionalProperties`, `$ref`/`$defs` inlined, `oneOf` → `anyOf`, formats, bounds as needed). Fallback: the OpenAI-compatible endpoint.                                                                                                                                                                                                                                                                                                                                                                      |
| **Mock**              | Scripted, deterministic responses keyed by agent and step. Used by tests and for the "no model" demo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Router.** It resolves the model in this order: per-run override (chat model chip) → per-agent override → global default. With **prefer local** on, an available Ollama model is tried first. On `429`, `5xx`, timeout or network error it retries up to N times with exponential backoff and full jitter (honouring `Retry-After`), then moves down the ordered fallback chain. If every model fails, the run goes to **rule-based mode**. `invalid_key` does not retry; it marks the provider unhealthy. Every attempt writes an `LlmCall` row, and the run records the model that actually served it.

**Budgets.** Per provider: an RPM token bucket, a concurrency semaphore (Ollama 1) and a daily call budget (defaults: OpenRouter free 50/day, others conservative, all editable). A budget that would be exceeded is treated like a 429 and triggers fallback. **Scheduled runs call the LLM only when the deterministic fingerprint changed.**

**Capability awareness.** Capabilities come from provider metadata, then the `ModelCapability` cache. For unknown models there is a one-click probe (a tiny forced tool call) whose result is cached. Models without native tools use the **JSON protocol**: the system prompt describes tools, and the model must reply with `{"tool": name, "args": {…}}` or `{"final": {…}}`. The reply is parsed tolerantly (fenced blocks stripped), validated with Zod, and on failure the error is fed back, up to 2 retries.

**Thinking.** `<think>…</think>` blocks and provider reasoning fields are split from answer content before any parsing, stored in `AgentStep.reasoning`, and shown collapsed. A per-provider "disable thinking" setting uses `think: false` (Ollama) or `thinkingBudget: 0` (Gemini) where supported.

**Timeouts.** Separate connect and idle timeouts: 60 s idle for cloud; 300 s idle for local, with streaming keeping the connection alive. All configurable. Runs execute in pg-boss workers, so the UI never blocks; progress arrives over SSE.

**Secrets.** Keys are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY` (32 bytes, generated by `pnpm bootstrap`). They are never returned to the browser (only `apiKeyLast4`). A Pino `redact` config and audit redaction keep them out of logs. Keys in `.env` are a fallback for when no UI key is set.

---

## 7. Agents

### Runtime

- **Definition:** a code module per agent (`definitions/<key>.ts`) holding the default prompt, allowed tools, triggers, limits, output Zod schema and a **deterministic analyzer** `analyze(ctx) → { findings, fingerprint, ruleBasedOutput }`. The editable parts (prompt, autonomy, schedule, model, limits, enabled) are stored in `AgentDefinition`. "Reset to default" restores the code values.
- **Run pipeline** (one pg-boss queue per agent with a singleton policy, so there is one run per agent at a time):
  1. **Analyze** (deterministic).
  2. If the trigger is a schedule or event and the fingerprint matches the last successful run → `NO_CHANGE`, with no LLM call.
  3. If no model is available → persist `ruleBasedOutput` (outputs plus rule-based proposals) with `mode = RULE_BASED`.
  4. Otherwise build the context: system prompt, the org's key settings, analyzer findings (the delta only), and a summary of the agent's last 10 decisions (approved, edited, rejected, with reasons).
  5. **Loop:** call the model with tool schemas → validate each tool call's args with Zod (structured error back to the model on failure) → execute through the tool registry → record a step → repeat until `final`, or until `maxSteps`, `maxToolCalls` or `timeoutMs` is hit.
  6. Validate the final output against the agent's schema (one repair retry). If it still fails → fall back to `ruleBasedOutput`, with the reason recorded.
  7. Persist outputs, publish SSE, then the orchestrator runs hand-offs.
- **Write tools → proposals:** `ActionService.propose()` validates the payload, computes the expected impact deterministically, applies dedupe (`dedupeKey` + window), and then:
  - `observe` → the proposal is recorded as a finding only.
  - `recommend` → `PENDING`.
  - `act` → auto-executes if it passes the limits (`maxActionsPerRun`, `maxPoValue`, risk = LOW); otherwise `PENDING`.
- **Recovery:** at boot, runs still `RUNNING` become `FAILED` ("interrupted by restart"). pg-boss retries transient failures twice.

### Tool registry

`{ name, description, inputSchema: Zod, kind: 'read' | 'write', label: (args) => "Comparing 3 suppliers…", handler(ctx, args) }`. JSON Schema is generated with `z.toJSONSchema()` (Zod 4) and then run through the per-provider sanitizer. Read tools return compact, paginated results (max ~40 rows, pre-summarized numbers, `nextCursor`).

| Read tools                                                                                                                                                                                                                                                                                                                                                                                                                                           | Write tools (→ proposals)                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_inventory_kpis`, `search_products`, `get_product_details`, `list_stock_risks`, `get_sales_history`, `get_forecast`, `list_forecast_shifts`, `compute_reorder_plan`, `compare_suppliers`, `get_supplier_scorecards`, `list_anomalies`, `get_abc_xyz_summary`, `list_slow_and_dead_stock`, `find_rebalancing_opportunities`, `list_open_alerts`, `list_open_purchase_orders`, `list_pending_actions`, `get_agent_activity`, `query_sales_summary` | `propose_purchase_order`, `propose_transfer`, `propose_reorder_params`, `propose_cycle_count`, `propose_markdown`, `propose_preferred_supplier_change`. Output tools (direct): `publish_alerts` (prioritize and explain analyzer alerts), `publish_findings`, `publish_report` |

### The agents

| Agent                     | Triggers                                                               | Deterministic analyzer (numbers)                                                                                                                                                                                                                                                                                                                                                              | LLM job (judgment)                                                                                                                          | Outputs / actions                                                                                                   | Hand-offs                                                                   |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Stock Sentinel**        | `*/15 * * * *`; `stock.changed` debounced 60 s (collects product IDs)  | Per product × warehouse: available vs reorder point / safety stock, out of stock, overstock (> maxStock or > 180 days of cover), days of cover = available ÷ forecast daily demand, projected stockout (cover < lead time + review period), batches expiring within N days (shelf-life-aware)                                                                                                 | Prioritize, merge related issues, explain in plain language, and decide which items are urgent for replenishment                            | Alerts (dedupe by type + product + warehouse); auto-resolves alerts whose condition cleared                         | Low / projected items → Replenishment Planner (`HANDOFF`, with product IDs) |
| **Demand Forecaster**     | Nightly `0 2 * * *`; manual                                            | Per SKU: classify the demand pattern (ADI / CV², Syntetos–Boylan). Smooth/erratic → Holt-Winters additive, damped trend, weekly seasonality (m = 7), with parameters by grid search on SSE. Intermittent/lumpy → Croston-SBA. < 28 days of history → moving average. 28-day holdout gives MAPE/WAPE. 80 % / 95 % bands from residual σ·√h.                                                    | A short narrative on notable shifts per category (forecast vs last week, seasonality, festive peaks)                                        | `Forecast` rows (`isLatest`); `FORECAST_SHIFT` alerts for large shifts                                              | → Planner (daily plan uses fresh forecasts)                                 |
| **Replenishment Planner** | Sentinel hand-off; daily `0 7 * * *`                                   | Reorder point = d̄·L + SS, with SS = z·√(L·σd² + d̄²·σL²) and z from the target service level (inverse normal). EOQ = √(2DS/H), rounded up to MOQ / pack size. Order-up-to covers the lead time plus the review period. Inventory position counts on-order stock. Supplier choice by weighted landed cost, lead time and score. Priority = shortfall ÷ lead time. Greedy fill up to the budget. | Choose and justify suppliers, group lines per supplier, trim to budget with reasons, and flag judgment calls ("MOQ forces 3× usual qty")    | `propose_purchase_order` per supplier, with per-line rationale                                                      | —                                                                           |
| **Anomaly Auditor**       | Hourly `0 * * * *`; `stock.adjusted`, `count.completed`, `po.received` | Robust z-score 0.6745·(x − median)/MAD > 3.5 on daily demand. Rules: ≥ 3 negative adjustments in 14 days per SKU/warehouse; count variance > 5 % or > ₹X; receipt ≠ PO qty / price ±5 %; unit cost jump > 15 % vs the 90-day median                                                                                                                                                           | Triage: likely causes, severity, what to check                                                                                              | `ANOMALY` / `DEMAND_SPIKE` alerts; `propose_cycle_count`                                                            | —                                                                           |
| **Supplier Analyst**      | Weekly `0 6 * * 1`; `po.received`                                      | Per supplier over 180 days: on-time rate (received ≤ expected + 1 day grace), lead-time mean and CV, fill rate (received ÷ ordered), price trend (regression slope of unit cost, % per 90 days), rejection rate. Score = 35 % on-time + 20 % fill + 15 % lead-time stability + 15 % price + 15 % quality, from 0 to 100.                                                                      | Explain score changes, flag risks, suggest alternatives from the supplier catalog                                                           | Supplier score and breakdown; `SUPPLIER_RISK` alerts; `propose_preferred_supplier_change`                           | —                                                                           |
| **Inventory Optimizer**   | Weekly `0 5 * * 1`                                                     | ABC by annual consumption value (80 / 15 / 5 %); XYZ by CV of weekly demand (≤ 0.5 / ≤ 1.0 / > 1.0). Dead stock = no sales in 90 days with on-hand > 0. Slow = cover > 180 days. Excess value. Rebalancing = warehouse pairs where one has cover > 2× target and the other < lead time. Reorder-parameter drift vs the planner's computed values.                                             | Rank opportunities by value, write proposals                                                                                                | Product classifications; `propose_transfer`, `propose_markdown`, `propose_reorder_params`; bundle ideas as findings | —                                                                           |
| **Report Writer**         | Daily at briefing time (default 08:00 IST); weekly Monday              | KPIs and deltas, what changed (alerts, stockouts, receipts), risks, agent activity, pending decisions                                                                                                                                                                                                                                                                                         | Write the briefing narrative: concise, cites the numbers                                                                                    | `Report`; PDF export                                                                                                | —                                                                           |
| **Assistant**             | Chat                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                             | Answers from tool results, citing the data used ("based on 90 days of sales"); renders inline tables and charts from structured tool output | Streaming answer. Write tools render **confirmation cards**; on confirm, the action executes as the _user_          | —                                                                           |

Default prompts are short and job-specific. Each tells the model to use tools rather than guess, to cite the data used, to never invent numbers (numbers come only from tool results), and to return the output schema. The full prompts, formulas and examples go in `docs/AGENTS.md` (Phase 5).

**Orchestrator** (deterministic, not an LLM): a domain-event → agent trigger map with per-agent debounce windows, the hand-off rules above, pg-boss cron registration from `AgentDefinition.triggers` (re-registered on edit), locks via singleton queues, and a network view of edges (`GET /agents/graph`).

---

## 8. HTTP API (`/api/v1`)

Conventions:

- Lists take `?page&pageSize&sort=field:dir&q&<filters>` and return `{ data, meta: { page, pageSize, total } }`. The ledger, audit log and run steps use keyset pagination (`cursor`).
- Every error uses the envelope `{ error: { code, message, details? } }`.
- OpenAPI is generated through `fastify-type-provider-zod` + `@fastify/swagger`; the UI is at **`/api/docs`** (`@fastify/swagger-ui`, whose assets are served locally).
- Mutations require `Content-Type: application/json` and a same-origin `Origin` check (CSRF defence on top of SameSite).

| Area                  | Routes                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System                | `GET /health` · `GET /system/info`                                                                                                                                                                                                                                                                                                                                                       |
| Auth                  | `POST /auth/login` (rate-limited) · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password`                                                                                                                                                                                                                                                                                  |
| Users                 | `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password`                                                                                                                                                                                                                                                                                                                |
| Settings              | `GET/PATCH /settings/organization` · `GET/PATCH /me/preferences` · CRUD `/units`, `/categories` (tree), `/warehouses`, `/reason-codes`                                                                                                                                                                                                                                                   |
| Products              | `GET/POST /products` · `GET/PATCH/DELETE /products/:id` · `POST /products/bulk` · `POST /products/import/preview` (multipart CSV) · `POST /products/import/commit` · `GET /products/export?format=csv\|xlsx` · `POST /products/:id/image` · `GET /products/:id/{stock,movements,sales,forecast,suppliers,insights,activity}`                                                             |
| Saved views           | `GET/POST /saved-views` · `PATCH/DELETE /saved-views/:id`                                                                                                                                                                                                                                                                                                                                |
| Stock                 | `GET /stock-levels` · `GET /movements` · `POST /stock/receive` · `POST /stock/issue` · `POST /stock/adjust` · `GET /batches` · `GET /stock/fefo?productId&warehouseId&qty`                                                                                                                                                                                                               |
| Transfers             | `GET/POST /transfers` · `GET /transfers/:id` · `POST /transfers/:id/{ship,receive,cancel}`                                                                                                                                                                                                                                                                                               |
| Cycle counts          | `GET/POST /cycle-counts` · `GET /cycle-counts/:id` · `PATCH /cycle-counts/:id/lines` · `POST /cycle-counts/:id/{submit,approve,cancel}`                                                                                                                                                                                                                                                  |
| Suppliers             | `GET/POST /suppliers` · `GET/PATCH /suppliers/:id` · `GET/POST /suppliers/:id/catalog` · `PATCH/DELETE /suppliers/:id/catalog/:linkId` · `GET /suppliers/:id/scorecard`                                                                                                                                                                                                                  |
| Purchase orders       | `GET/POST /purchase-orders` · `GET/PATCH /purchase-orders/:id` · `POST /purchase-orders/:id/{submit,approve,send,cancel,close}` · `POST /purchase-orders/:id/receipts` · `GET /purchase-orders/:id/pdf`                                                                                                                                                                                  |
| Sales                 | `GET/POST /customers` · `GET/PATCH /customers/:id` · `GET/POST /sales-orders` · `GET /sales-orders/:id` · `POST /sales-orders/:id/{confirm,fulfill,cancel}`                                                                                                                                                                                                                              |
| Alerts                | `GET /alerts` · `POST /alerts/:id/{acknowledge,snooze,resolve}` · `POST /alerts/bulk`                                                                                                                                                                                                                                                                                                    |
| Approvals             | `GET /actions` · `GET /actions/:id` · `POST /actions/:id/approve` (optional `editedPayload`) · `POST /actions/:id/reject`                                                                                                                                                                                                                                                                |
| Agents                | `GET /agents` · `GET/PATCH /agents/:key` · `POST /agents/:key/reset-prompt` · `POST /agents/:key/run` · `GET /agents/:key/runs` · `GET /agents/graph` · `GET /runs/:id` (with steps) · `POST /runs/:id/cancel`                                                                                                                                                                           |
| AI                    | `GET /ai/status` (top-bar chip) · `GET /ai/providers` · `POST /ai/providers` (custom) · `PATCH/DELETE /ai/providers/:key` · `POST /ai/providers/:key/test` · `GET /ai/providers/:key/models?refresh=1` · `GET /ai/models?local&free&tools&q` · `POST /ai/models/probe` · `POST /ai/models/latency-test` · `GET/PUT /ai/routing` · `GET /ai/usage` · `GET /ai/ollama` (version, tags, ps) |
| Assistant             | `GET/POST /assistant/conversations` · `GET/DELETE /assistant/conversations/:id` · `POST /assistant/conversations/:id/messages` (SSE-streamed response) · `POST /assistant/actions/:id/confirm`                                                                                                                                                                                           |
| Dashboard & analytics | `GET /dashboard/{kpis,charts,activity}` · `GET /analytics/{valuation,movements,abc-xyz,turnover,forecast-accuracy,suppliers,dead-stock}` (date range, category, warehouse filters)                                                                                                                                                                                                       |
| Reports               | `GET /reports` · `GET /reports/:id` · `POST /reports/generate` · `GET /reports/:id/{pdf,csv}`                                                                                                                                                                                                                                                                                            |
| Notifications         | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all`                                                                                                                                                                                                                                                                                                   |
| Audit                 | `GET /audit-log` (actor, agent, entity, action, date filters; before/after included)                                                                                                                                                                                                                                                                                                     |
| Search                | `GET /search?q` (products, suppliers, POs, SOs, customers, pages)                                                                                                                                                                                                                                                                                                                        |
| Simulation            | `GET /simulation` · `POST /simulation/{start,stop}` · `PATCH /simulation` (speed) · `POST /simulation/scenarios/:key` · `POST /demo/reset`                                                                                                                                                                                                                                               |
| Realtime              | `GET /events` (SSE)                                                                                                                                                                                                                                                                                                                                                                      |

---

## 9. Frontend

**Routes:** `/login`, `/` (dashboard), `/products`, `/products/$id`, `/stock` (levels), `/stock/movements`, `/stock/batches`, `/transfers`, `/cycle-counts`, `/cycle-counts/$id`, `/suppliers`, `/suppliers/$id`, `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/$id`, `/sales-orders`, `/sales-orders/$id`, `/customers`, `/alerts`, `/approvals`, `/agents`, `/agents/$key`, `/agents/runs/$runId`, `/assistant`, `/analytics/*`, `/reports`, `/reports/$id`, `/settings/*` (organization, users, warehouses, categories, units, reason-codes, notifications, appearance, ai, import-export, demo), `/audit`, `/simulation`, `/about`, `/design`.

**Sidebar groups:**

- Overview: Dashboard, Alerts, Approvals
- Inventory: Products, Stock, Transfers, Cycle counts
- Purchasing: Suppliers, Purchase orders
- Sales: Sales orders, Customers
- AI Agents: Agents, Assistant, Simulation
- Insights: Analytics, Reports, Audit log
- Settings

**Design tokens (Phase 1; final values tuned for WCAG AA in both themes):**

| Token                           | Light                                                            | Dark                              |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| canvas                          | `#F5F5F7`-ish soft off-white                                     | `#111113`                         |
| surface / surface-2 / surface-3 | `#FFFFFF` / `#FAFAFB` / `#F0F0F3`                                | `#1A1A1D` / `#212125` / `#2A2A2F` |
| border (hairline)               | `rgb(0 0 0 / 0.08)`                                              | `rgb(255 255 255 / 0.08)`         |
| text / secondary / tertiary     | `#1C1C1E` / `#5E5E66` / `#7A7A82` (≥ 4.5:1 on canvas)            | `#F2F2F4` / `#A8A8B0` / `#8C8C94` |
| accent                          | refined blue ~`#0A66D8` (≥ 4.5:1 on white)                       | ~`#4C9AFF`                        |
| success / warning / danger      | muted green / amber / red, used for status only                  | lifted variants                   |
| ai marker                       | the accent-tinted `Sparkles` icon + "AI" label; never a gradient | same                              |

- **Type scale:** 12 / 13 / 15 / 17 / 20 / 24 / 32, with line heights 16 / 18 / 22 / 24 / 26 / 30 / 38. Weights 400 / 500 / 600. Headings −0.01 to −0.02 em. `font-variant-numeric: tabular-nums` on all figures.
- **Radius:** 6 (chips), 8 (controls), 14 (cards), 20 (sheets and dialogs).
- **Shadows:** floating layers only (menus, popovers, dialogs, sheets), low opacity.
- **Motion:** 150 / 200 / 250 ms, ease-out or spring. Everything goes through a `useReducedMotion` gate.
- **Materials:** the sidebar, top bar and sheets use `backdrop-filter: blur(20px) saturate(180%)` with an 80 % surface tint, plus an `@supports` solid fallback.
- **Fonts:** `@fontsource-variable/inter`. The stack is `-apple-system, BlinkMacSystemFont, "Inter Variable", "Inter", "Segoe UI", sans-serif`.

**Core components (Phase 1):** Button, IconButton, Input, Textarea, NumberInput, Select, Combobox, Checkbox, Switch, RadioGroup, Label/Field (with inline errors), Card, Badge, StatusPill, Table + DataTable, Tabs, SegmentedControl, Dialog, Sheet, Popover, DropdownMenu, Tooltip, Skeleton, EmptyState, ErrorState, KpiCard (count-up + sparkline + delta), ChartCard + chart wrappers, AiMarker, ModelChip, Kbd, Avatar, Toaster, PageHeader, and a `/design` gallery page in both themes.

---

## 10. Phase checklist

### Phase 0 — Check, plan, stop

- [x] Prerequisite check (Node 24 ✓, Git ✓, pnpm installed ✓, PostgreSQL ✗, Ollama ✗, git identity ✗)
- [x] `docs/PROJECT_BRIEF.md`, `docs/PLAN.md`, `CLAUDE.md`
- [x] Blocking questions asked
- [x] **Approval received** (2026-09-27: "all installed, check and continue"; the §1 proposals were accepted by proceeding)

### Phase 1 — Foundations → stop for UI review

- [x] pnpm workspace (`allowBuilds` for esbuild/prisma), TS 6 strict configs, ESLint 10 flat config + typescript-eslint (type-aware), Prettier, Vitest 5 projects, `.editorconfig`, `.gitattributes` (LF)
- [x] `scripts/bootstrap.mjs` (`.env` from `.env.example`, generates `COOKIE_SECRET` and `APP_ENCRYPTION_KEY`, prompts for the DB password, adds new keys on re-run), `scripts/preflight.mjs` (named `preflight` because `pnpm doctor` is a built-in pnpm command)
- [x] Zod env validation with friendly errors; Pino logging with redaction
- [x] Prisma 7 schema and initial migration (hand-written SQL for CHECKs, partial uniques, pg_trgm); `db:setup`
- [x] Deterministic seed: ~230 products, 3 warehouses, 12 suppliers, 40 customers, 548 days simulated day by day (≈340k ledger rows, 7.6k POs, 9.9k sales orders); planted situations are date-independent (verified on 5 anchor dates); in-memory invariants verified before writing; `--dry-run` and `--date=` options
- [x] `pnpm check:ledger` (6 SQL invariant checks)
- [x] Fastify app: error envelope, helmet (CSP), CORS, rate limit, signed httpOnly cookie sessions, Origin check, RBAC plumbing, `/health`, `/system/info`, OpenAPI at `/api/docs`, SPA serving in production, tsdown bundle
- [x] Auth: login, logout, me, change password (argon2id), preferences; integration tests written (skip until a test DB is reachable)
- [x] Dashboard overview endpoint (real aggregates) and dashboard page — pulled forward from Phase 2 so the shell is reviewed with real data
- [x] Design tokens (light/dark/system), Inter via @fontsource, Tailwind v4 theme; core components; chart wrappers; AiMarker
- [x] App shell: collapsible translucent sidebar (drawer on mobile), top bar (title, ⌘K palette, theme menu, user menu), login page with the official subtitle and demo accounts, Settings (appearance, account), About, `/design`
- [x] Typecheck, lint, Prettier and tests green (40 tests: 31 unit + 9 DB integration)
- [x] Migrated + seeded PostgreSQL 18 (seed ≈ 104 s — to be cut below 60 s with the one-click reset in Phase 6); `pnpm check:ledger` 6/6 green; integration tests green
- [x] Browser review at 1440 / 1024 / 390 in both themes (`pnpm qa:screens`, headless Edge): no console errors, no horizontal overflow; fixes applied (chart animations, KPI layout, mobile table, sales trend ending at the last complete day, `/auth/session` to avoid a 401 on the sign-in page, SPA fallback in production)
- [x] `pnpm build && pnpm start` verified: app + API + docs on one port, SPA fallback, CSP
- [ ] First commit — **waiting for git `user.name` / `user.email`**
- [ ] **Stop for UI review**

**Phase 1 decisions (beyond §1):**

- All `DateTime` columns are `timestamptz`; `@db.Date` columns hold IST business days (`sales_daily`, `inventory_snapshots`, batch dates).
- Reorder point / safety stock / max stock live on `StockLevel` (per warehouse); product-level fields are defaults.
- `DocumentSequence` table for human-readable numbers (PO-2026-00412).
- `DEMO_MODE=true` shows the demo accounts and password on the sign-in screen.
- `NODE_ENV` is not set in `.env`: Vite would otherwise build development React. The server defaults to development; `pnpm start` sets production.
- Future Prisma migrations: generate with `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` and **remove any `DROP INDEX` / `DROP CONSTRAINT` lines for the hand-written objects** at the end of the init migration (Prisma doesn't model them).

### Phase 2 — Core inventory

- [ ] Catalog: categories (tree), units, products (table with search, filters, sort, column visibility, density, saved views, bulk actions, virtualization, stacked cards on mobile), product create/edit, image upload, detail page tabs (overview, stock by warehouse, movements, sales chart, suppliers, activity)
- [ ] CSV import (preview, validation, error report) and CSV/XLSX export
- [ ] `InventoryService.recordMovement` + receive / issue / adjust (reason codes) / write-off; batches and FEFO suggestions; ledger invariant tests
- [ ] Warehouses, transfers (ship → receive), cycle counts with variance review and approval
- [ ] Suppliers, supplier catalog, scorecard page (metrics computed; charts)
- [ ] Purchase orders: full state machine, receiving (partial), PDF export
- [ ] Customers, sales orders (reserve → fulfill with FEFO)
- [ ] Alerts center (manual and rule alerts for now), audit log page with diffs
- [ ] Dashboard v1 (KPIs with deltas and sparklines, value trend, category mix, top movers, stockout risk)
- [ ] API integration tests for core routes; verify in the browser; commit

### Phase 3 — LLM gateway

- [ ] Types, registry, adapters (Ollama, OpenAI-compatible + presets, Gemini native, Mock), schema sanitizer, thinking splitter
- [ ] Encrypted keys, provider CRUD, test connection, health states, live model discovery and caching, capability probe
- [ ] Router: default, per-agent, fallback chain, prefer local; retry/backoff/jitter; budgets (RPM, concurrency, daily); `LlmCall` log
- [ ] AI & models settings page (provider cards, Ollama live card polling every 10 s, model browser, latency test, routing config, usage analytics); model chip in the top bar
- [ ] Adapter tests with mocked HTTP; manual check against real Ollama plus any keys provided; commit

### Phase 4 — Agent runtime

- [ ] Tool registry (Zod → JSON Schema), loop (native tools + JSON protocol), limits, run recorder, thinking capture
- [ ] pg-boss queues (singleton per agent), cron schedules, event triggers with debounce, orchestrator, restart recovery
- [ ] SSE hub + client invalidation map; live agent indicator
- [ ] Proposals (`ActionService`), dedupe, autonomy gating, executors; approvals inbox (reasoning, data used, impact; approve, edit-and-approve, reject with reason); feedback loop into context
- [ ] Agents hub (cards, enable/disable, run now, edit prompt/schedule/autonomy/model/limits, run history, run timeline, live run view, network view)
- [ ] Agent-loop tests with the Mock provider (tool call → proposal → approval → execution); commit

### Phase 5 — Analytics and agents

- [ ] Pure analytics with unit tests: Holt-Winters, Croston-SBA, SES, MA, pattern classification, MAPE/WAPE; inverse normal, ROP/SS/EOQ with MOQ/pack rounding; robust z / MAD and rule checks; ABC–XYZ; supplier score
- [ ] Each agent: analyzer, tools, prompt, output schema, rule-based fallback; runs verified with Ollama and without a model
- [ ] Assistant: streaming chat (side panel and full page), tool use, inline tables/charts, confirmation cards, citations
- [ ] `docs/AGENTS.md`; commit

### Phase 6 — Insights, reports, simulation

- [ ] Analytics pages (valuation, movements, ABC–XYZ matrix, turnover, forecast accuracy, supplier performance, dead stock) with filters and drill-down
- [ ] Reports: daily briefing and weekly summary, history, viewer, PDF/CSV
- [ ] Notifications (bell, toasts, preferences), command palette (navigate, find records, actions, ask the Assistant)
- [ ] Import/export settings page, reset demo data
- [ ] Simulation panel: start/stop, speed, scenarios (Festive rush, Supplier delay, Shrinkage incident, Demand drop), auto-send/receive in demo mode, one-click reset
- [ ] Onboarding checklist and no-AI guidance; commit

### Phase 7 — Polish and acceptance

- [ ] Every page reviewed at 1440 / 1024 / 390 in both themes; loading, empty and error states; accessibility pass (keyboard, focus, labels, contrast)
- [ ] Performance: indexes verified with `EXPLAIN`, no N+1 queries, code-split bundle check
- [ ] Playwright smoke test (Edge channel) of the main flow
- [ ] README, `docs/ARCHITECTURE.md` (Mermaid), `docs/AGENTS.md`, `docs/DEMO_SCRIPT.md`
- [ ] Acceptance checklist (brief §12) run and recorded here

### Stretch (only after acceptance)

Smart document intake (vision) · barcode/QR labels and webcam scanning · pull Ollama models from the UI · email notifications · semantic search with embeddings.

---

## 11. Risks and mitigations

| Risk                                                                                        | Mitigation                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Small local models produce bad tool calls                                                   | Zod-validated args with corrective feedback; JSON-protocol fallback; numbers only from tools; rule-based fallback output |
| Free-tier quotas run out during a demo                                                      | Fingerprint-gated scheduled runs; daily budgets; fallback to local Ollama; usage view shows the remaining budget         |
| Seed time for ~18 months of ledger history                                                  | Bulk inserts (`createMany` in large batches, or `unnest` array inserts via raw SQL); target < 60 s                       |
| Library majors newer than common knowledge (TanStack Table 9, pg-boss 12, Prisma 7, Vite 8) | Read the current docs before each integration; pin versions in `package.json`                                            |
| Windows path, line-ending and script issues                                                 | Node-only scripts, `cross-env`, `.gitattributes` with LF, CI-style checks run locally on Windows                         |
