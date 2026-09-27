# Build brief: Automatic Inventory Management Using Agents

> **Claude Code:** read this entire brief before doing anything. It is the source of truth for the project. Keep it in the repo at `docs/PROJECT_BRIEF.md` and re-read the relevant section before starting each phase.

- **Official project title:** Automatic Inventory Management Using Agents
- **Working product name:** Stockroom. Define it once (`APP_NAME`) so it can be renamed, and show the official title as a subtitle on the login screen and the About page.
- **Context:** this is my college mini project, but I want it built to the standard of a commercial SaaS product.
- **Localhost only:** the whole system runs on my computer and is served on `localhost`, with servers bound to `127.0.0.1`. That covers the web app, the API, PostgreSQL and Ollama. No deployment, hosting, Docker or cloud services. The UI loads nothing from the internet (fonts, icons and libraries are bundled). The only outbound calls are to cloud AI providers I choose to enable, and with an Ollama model selected everything must work with the internet off.

---

## 1. Goal

Build a full-stack web application in which a team of AI agents continuously watches the inventory, forecasts demand, drafts purchase orders, catches anomalies, scores suppliers and writes reports, while people stay in control by approving consequential actions. The AI layer must work with several free cloud LLM providers **and** with local models through Ollama, which the app detects automatically.

**Non-negotiables**

1. **Everything visible works.** No placeholder buttons, "coming soon" screens, fake charts or lorem ipsum. If a feature can't be finished, leave it out of the UI and tell me.
2. **Agents do real work** through tools on real data: alerts, forecasts, draft purchase orders, proposals and reports. The chat assistant is one feature, not the product.
3. **Numbers come from code; judgment comes from the model.** Forecasts, reorder points, anomaly scores and classifications are computed deterministically. The LLM reads those results through tools, then decides, prioritizes and explains. This keeps results correct even with small local models.
4. **Works offline** with Ollama, and still works with no model at all (rule-based results, clearly labeled).
5. **Provider-agnostic AI.** Changing provider or model is a settings change, never a code change.
6. **UI/UX is the top priority** (section 8).
7. Clean architecture, strict TypeScript, real error handling, tests and documentation.

---

## 2. How to work

**Phase 0: check, plan, then stop.**

1. Check prerequisites: Node.js (LTS), pnpm (install it with npm if missing), Git, a reachable PostgreSQL server, and Ollama (`GET http://localhost:11434/api/version` and `/api/tags`). Tell me exactly what is missing and how to install it on my OS.
2. Write `docs/PLAN.md`: architecture, folder structure, a full Prisma schema draft, agent specs, the API route list, and the phase checklist from section 11.
3. Write a concise `CLAUDE.md` (under ~200 lines): commands, conventions, architecture rules, design rules, and pointers to this brief and the plan.
4. Ask any blocking questions in one batch (for example, database connection details, or which `.env` values I should fill in myself). **Then stop and wait for my approval.**

**Second stop at the end of Phase 1:** I review the design system and app shell before any pages are built on them.

**After that**, work through the phases in order. Each phase must end **runnable and verified**: typecheck, lint and tests pass; the app boots; and you have exercised the new features yourself (API calls, scripts, and screenshots if you have a browser tool). Then commit, tick the checklist in `PLAN.md`, give me a short summary with how to try it, and continue.

**Always:**

- Providers and libraries change. Check current official docs before integrating any provider or library, and use current stable versions rather than versions from memory.
- Keep `CLAUDE.md` and `PLAN.md` current so a new session can continue where the last one stopped.
- If something in this brief is technically wrong or a clearly better option exists, say so and propose it. Don't deviate or cut scope silently.
- I may be on Windows. Every script must work on Windows, macOS and Linux (Node scripts, `cross-env`, no bash-only scripts).
- Use Git from the first commit. Never commit `.env` or secrets.

---

## 3. Tech stack (decided; change only with a stated reason)

```
apps/web          React + Vite + TypeScript single-page app
apps/server       Node.js + TypeScript API, agent runtime, scheduler
packages/shared   Zod schemas, types and constants used by both
```

- **Frontend:** React, Vite, TypeScript (strict), Tailwind CSS, shadcn/ui (Radix) restyled to our design system, TanStack Router (or React Router), TanStack Query, TanStack Table with virtualization, React Hook Form + Zod, Recharts, Motion (formerly Framer Motion), cmdk, Sonner, Lucide icons, date-fns. Fonts are self-hosted with @fontsource so the UI works offline.
- **Backend:** Node.js LTS, Fastify with a Zod type provider, Prisma, PostgreSQL, pg-boss (Postgres-backed jobs and cron, so no Redis), Pino logging, argon2, httpOnly cookie sessions, and Server-Sent Events (SSE) for realtime updates.
- **Tests:** Vitest, plus one Playwright smoke test in the final phase.
- **Why PostgreSQL:** the data is relational (products, suppliers, warehouses, orders), every stock change needs a multi-row ACID transaction, and constraints and indexes protect integrity. JSONB holds agent traces. MongoDB was considered and rejected: multi-document transactions need a replica set, and Prisma requires one for MongoDB.
- **Developer experience:** `pnpm bootstrap` creates `.env` from `.env.example` and generates secrets. `pnpm db:setup` migrates and seeds. `pnpm dev` runs server and web together (Vite proxies `/api`, so cookies are same-origin). `pnpm build && pnpm start` serves the built app from Fastify on one port. `.env.example` documents every variable, and the environment is validated with Zod at boot with friendly errors ("Can't reach PostgreSQL at …; is the service running?").

---

## 4. Architecture rules

```
React SPA ──REST + SSE──► Fastify routes ──► Services ──► Prisma ──► PostgreSQL
                                                ▲
                                          tools │
                           Agent runtime ───────┘   (pg-boss schedules + domain events)
                                 │
                           LLM gateway ──► Ollama (local) · Gemini · OpenRouter · NVIDIA NIM · Groq · custom
```

- Routes are thin. **All business rules live in services.**
- **Agents are just another client of the services.** Agent tools call the same services as the HTTP routes, so validation, invariants, permissions and audit logging apply equally to people and agents. Agents never touch Prisma directly.
- Stock changes only through one service method (e.g. `InventoryService.recordMovement()`), which writes the ledger row and updates the balance in one transaction and refuses to go negative. Add a test and a script that check every balance equals the sum of its ledger.
- Every mutation writes an audit entry recording the actor: a user, or an agent plus its run ID.
- Services emit domain events (`stock.changed`, `sale.recorded`, `po.received`, `alert.created`, …) on an internal bus. The agent scheduler subscribes (debounced), and the SSE hub pushes events to the browser.
- Money uses Decimal, never floats.

---

## 5. AI layer: the LLM gateway

The rest of the app depends only on this interface:

```ts
interface LLMProvider {
  id: string;
  listModels(): Promise<ModelInfo[]>;             // live discovery, cached, refreshable
  healthCheck(): Promise<ProviderHealth>;         // connected | invalid_key | rate_limited | offline
  chat(req: ChatRequest): Promise<ChatResponse>;  // messages + tools → text and/or tool calls
  chatStream(req: ChatRequest): AsyncIterable<ChatChunk>;
}
// ModelInfo: id, provider, displayName, contextWindow, isLocal, isFree,
//   capabilities { tools, vision, thinking, embedding, structuredOutput },
//   sizeBytes, parameterSize, quantization
```

### Adapters

**Ollama (native REST API).** Base URL defaults to `http://localhost:11434` and is editable in Settings.

- Discovery: `GET /api/version` (is it running, which version), `GET /api/tags` (installed models with size, family, parameter size, quantization), `POST /api/show` (each model's `capabilities`, such as `tools`, `vision` and `thinking`, plus context length), `GET /api/ps` (models currently loaded in memory).
- Chat through `POST /api/chat` with `tools`, `stream`, `keep_alive` and an explicit `options.num_ctx` (configurable, e.g. 8192). Ollama's default context window can be small and silently truncates long agent prompts, and its OpenAI-compatible endpoint can't set `num_ctx`, so use the native API.
- Poll status about every 10 seconds while the AI settings page is open, plus a Refresh button, so newly pulled models appear without restarting anything.

**OpenAI-compatible.** One adapter, configured per provider with a base URL, key and extra headers:

- OpenRouter: `https://openrouter.ai/api/v1`. List models via `GET /models`; mark free models (`:free` IDs or zero price); read `supported_parameters` to detect tool support.
- NVIDIA NIM: `https://integrate.api.nvidia.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Optional presets (verify current base URLs): Cerebras, Mistral, GitHub Models, Hugging Face, LM Studio.
- A **custom OpenAI-compatible endpoint** for anything else.

**Gemini.** Prefer a native adapter using Google's official Gen AI SDK, where tool calling is more reliable; the OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) is the fallback. Gemini's function-declaration schema is stricter than OpenAI's, so sanitize generated JSON Schemas per provider.

**Mock.** Scripted and deterministic, for tests and for demonstrating the no-AI mode.

### Behavior

- **No hardcoded model IDs** beyond suggested defaults; lists are fetched live. When a provider doesn't report tool support, offer a one-click capability probe (a tiny tool-call test) and cache the result.
- **Routing:** a global default model, per-agent overrides, an ordered fallback chain (e.g. Gemini → Groq → local Ollama), and a "prefer local" switch. On 429, 5xx, timeout or network errors, retry with exponential backoff and jitter (honoring `Retry-After`), then fall back. Record which model actually served each call.
- **Free-tier budgets:** free quotas are small. For example, OpenRouter's `:free` models allow about 50 requests a day on an account that hasn't bought credits (verify current limits). Enforce per-provider requests-per-minute, concurrency (Ollama: 1 by default) and daily call budgets. **Scheduled runs call the model only when the deterministic pass finds something new or changed**; otherwise the run is recorded as "no change" without an LLM call.
- **Capability-aware:** if a model has no native tool calling, the runtime switches to a JSON protocol (`{"tool": …, "args": …}` or `{"final": …}`), validates it with Zod, and retries with the validation error fed back.
- **Reasoning models:** separate `<think>`/reasoning content from the answer so it never breaks parsing; store it and show it collapsed in run traces; allow disabling thinking where the model supports it.
- **Timeouts** suit CPU-only laptops (configurable, generous for local models). Nothing in the UI blocks on a slow model.
- **Usage log:** provider, model, agent and run, tokens when reported, latency, status and error. This powers an AI usage view.
- **Secrets:** API keys entered in the UI are encrypted at rest (AES-256-GCM with `APP_ENCRYPTION_KEY`), never sent back to the browser (show only the last 4 characters) and never logged. Keys in `.env` work as a fallback.

---

## 6. Agents

### Runtime

- **Agent definition:** key, name, description, system prompt (editable, with reset to default), allowed tools, triggers (cron, domain events, manual, chat), autonomy level, model override, limits (max steps, max tool calls, timeout, max actions per run, max purchase-order value), enabled flag.
- **Autonomy levels:** `observe` (analyze and report) · `recommend` (every action becomes a proposal awaiting approval; the default) · `act` (low-risk actions within limits run automatically; anything beyond the limits becomes a proposal).
- **Loop:** assemble context → call the model with tool schemas → validate tool arguments with Zod (return structured errors so the model can correct itself) → execute → repeat until a final answer or a limit → validate the final output against the agent's schema (summary, findings, actions).
- **Tools:** a typed registry `{ name, description, inputSchema (Zod → JSON Schema), kind: 'read' | 'write', handler }`. Read tools call services and return compact, paginated, summarized results to suit small context windows. Write tools never mutate directly: they create an **agent action** (a proposal) that executes or waits for approval according to autonomy level and limits.
- **Every run is recorded:** trigger, model actually used, status, timings, tokens, every step (messages, tool calls, arguments, results, errors), final output and actions. Progress streams live to the UI over SSE.
- **Feedback loop:** approve, edit-and-approve, or reject with a reason. An agent's recent decisions are included in its next runs so it adapts to my preferences.
- **Safety:** one run per agent at a time; queued with retries; runs left "running" after a restart are marked failed; dedupe keys prevent duplicate alerts or purchase orders for the same item within a configurable window.
- **No-model mode:** the deterministic analyzers still run and create alerts and recommendations with rule-based explanations, labeled "Rule-based — AI unavailable".
- **Deterministic coordination:** an orchestrator routes events and hand-offs between agents and manages schedules and locks. LLMs reason inside each agent; they don't orchestrate.

### The agents

| Agent | Triggers | Job | Output |
|---|---|---|---|
| **Stock Sentinel** | Every 15 min + `stock.changed` (debounced) | Low stock, stockouts, overstock, projected stockouts (days of cover < lead time), expiring batches | Prioritized alerts with reasons; hands low items to the Replenishment Planner |
| **Demand Forecaster** | Nightly + manual | Per-SKU forecasts computed in code (Holt-Winters / exponential smoothing with weekly seasonality, Croston for intermittent demand, moving-average fallback) with confidence bands; tracks accuracy (MAPE) | Stored forecasts + a short narrative on notable shifts per category |
| **Replenishment Planner** | Sentinel hand-off + daily | Reorder point (lead-time demand + safety stock at a target service level), EOQ rounded to MOQ/pack size, supplier choice (cost, lead time, reliability), budget limit | Draft purchase orders grouped by supplier, with per-line rationale |
| **Anomaly Auditor** | Hourly + on adjustments and counts | Robust z-scores (median/MAD) and rule checks: demand spikes, repeated negative adjustments, count variances, receipts that don't match POs, cost jumps | Triaged findings with likely causes; proposes investigations or cycle counts |
| **Supplier Analyst** | Weekly + on PO receipt | On-time rate, lead-time variability, fill rate, price trend, returns → weighted score | Scorecards, risk flags, alternative-supplier suggestions |
| **Inventory Optimizer** | Weekly | ABC–XYZ classification, dead and slow stock, excess value, warehouse rebalancing, reorder-parameter tuning | Proposals: transfers, markdowns/bundles, new reorder points |
| **Report Writer** | Daily briefing (time configurable) + weekly | KPIs, what changed, risks, what the agents did, decisions waiting | In-app briefing + PDF export |
| **Assistant** | Chat (side panel + full page) | Answers with real data through the same tools; renders inline tables and charts; can take actions, each write shown as a confirmation card first | Streaming answers that cite the data used ("based on 90 days of sales") |

Default prompts are short and job-specific. They tell the model to use tools instead of guessing, to cite the data it used, and to return the defined output schema.

---

## 7. Inventory domain

### Data model (refine in `docs/PLAN.md`)

- **People:** users and roles (Admin, Manager, Staff); organization settings: name, currency (INR by default, with `en-IN` number formatting), timezone, units.
- **Catalog:** nested categories; products (SKU, barcode, name, description, category, brand, unit, cost and selling price, image, tags, status, track-expiry flag, reorder point, safety stock, lead time, ABC/XYZ class).
- **Stock:** warehouses; stock levels per product × warehouse (on hand, reserved, available); batches/lots with expiry; stock movements (receipt, sale, adjustment, transfer out/in, return, write-off, count correction), each with quantity, unit cost, reference, reason and actor.
- **Purchasing:** suppliers; supplier products (supplier SKU, cost, MOQ, pack size, lead time); purchase orders, lines and goods receipts.
- **Sales:** customers; sales orders and lines.
- **Operations:** transfers; cycle counts and lines.
- **Intelligence:** forecasts; alerts; notifications; agent definitions, runs, steps and actions; provider configs; LLM call log; reports.
- **Audit log.**

Index the hot paths.

### Features (all working end to end)

- **Auth and roles:** login, logout, change password; role-based access enforced in the API and reflected in the UI; seeded demo users for each role.
- **Dashboard:** KPI cards with deltas and sparklines (inventory value, low/out-of-stock, open POs, pending approvals, turnover, fill rate, days of inventory); stock value trend, sales vs forecast, category mix, top movers, stockout risk; today's AI briefing; live agent activity; alerts; quick actions.
- **Products:** table with search, filters, sorting, column visibility, saved views and bulk actions; CSV import with preview, validation and an error report; CSV/Excel export; detail page with tabs (overview, stock by warehouse, movements, sales and forecast chart, suppliers, AI insights, activity).
- **Stock operations:** receive, issue, adjust with reason codes, transfer between warehouses, batch/expiry handling with FEFO suggestions, cycle counts with variance review.
- **Suppliers:** list, detail, supplier catalog, performance scorecard with charts.
- **Purchase orders:** Draft → Pending approval → Approved → Sent → Partially received → Received → Closed/Cancelled; receiving against a PO (partial receipts allowed); PDF export; agent-drafted POs badged with the agent's rationale.
- **Sales orders and customers:** create and fulfill (reduces stock).
- **Alerts center:** filter, acknowledge, snooze, resolve, jump to the item; realtime.
- **Approvals inbox:** each proposal shows the reasoning, the data used and the expected impact (cost, days of cover gained); approve, edit-and-approve, or reject with a reason.
- **Agents hub:** a card per agent (status, last and next run, success rate, model); enable/disable and run now; edit prompt, schedule, autonomy and model; run history; run detail as a timeline of every step and tool call; a live view of a running agent; a simple network view of the agents and their hand-offs.
- **AI & models settings:** provider cards (enable, key, base URL, test connection, status). The Ollama card shows live detection, installed models, capability badges (Tools, Vision, Thinking), which models are loaded in memory, a warning for models without tool support, and helpful guidance when Ollama isn't running ("Start Ollama, then run `ollama pull …`"). Also: a model browser with search and filters (local, free, supports tools); a latency test; default, per-agent and fallback configuration; usage analytics. A model chip in the top bar shows the active model and switches it.
- **Analytics:** valuation, movement analysis, ABC–XYZ matrix, turnover by category, forecast accuracy, supplier performance, dead stock, with date-range, category and warehouse filters and drill-down.
- **Reports:** briefing history, viewer, PDF/CSV export.
- **Command palette (Ctrl/⌘ K):** navigate, find any record, run actions, ask the Assistant.
- **Notifications:** realtime bell and toasts.
- **Audit log:** filterable by user or agent, with before/after diffs.
- **Settings:** organization, users and roles, warehouses, categories, units, reason codes, notification preferences, appearance (light/dark/system), import/export, reset demo data.
- **Demo & simulation panel** (key for my presentation): start or stop a live simulator that generates sales and receipts at adjustable speed; scenario buttons (*Festive rush*, *Supplier delay*, *Shrinkage incident*, *Demand drop*) that make the agents react visibly end to end: stock falls → Sentinel alert → Planner drafts a PO → approval appears → receipt → Supplier Analyst updates scores. One-click reset.

### Seed data

A fictional Indian retail distributor: about 200 products in about 10 categories (some perishable, with batches and expiry dates), 3 warehouses, about 12 suppliers of varying reliability, and about 18 months of daily sales with trend, weekly seasonality, festive-season peaks and promotions. Plant anomalies and near-stockouts so every agent finds something real on its first run. Use a fixed random seed so demos are repeatable.

---

## 8. UI/UX: the top priority

**Direction:** inspired by Apple's design language (simplicity, spacing, typography, consistency and restraint) without copying it. Calm, content-first and premium. It should feel like a shipped commercial product, not a college project.

### Foundations

Build these first as design tokens (CSS variables wired into Tailwind), then build everything else from them.

- **Type:** `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif` (San Francisco on Apple devices, self-hosted Inter elsewhere). A tight scale (e.g. 12/13/15/17/20/24/32), semibold headings with slight negative tracking, tabular numerals for all figures, restrained weights.
- **Color:** neutral surfaces (a soft off-white canvas and white cards; a true dark theme in layered grays, not pure black), one refined blue accent, and green/amber/red used sparingly for status. AI-generated content gets one consistent, subtle marker (a small icon and an "AI" label) so it's always distinguishable from system data. WCAG AA contrast.
- **Space:** 4/8-pt grid, generous whitespace, consistent padding, strict alignment.
- **Shape and depth:** a radius scale (~8 px controls, ~14 px cards, ~20 px sheets and dialogs); hairline borders; soft, low-opacity shadows only on floating layers.
- **Materials:** translucent sidebar, top bar and sheets with backdrop blur, used sparingly, with a solid fallback.
- **Motion:** quick and quiet (150–250 ms, ease-out or spring) for page transitions, layout changes, KPI count-ups and skeletons; respect `prefers-reduced-motion`.
- **Icons:** Lucide at one stroke width and consistent sizes. No emoji in the UI.
- **Themes:** light, dark and system, equally polished.

### Layout and patterns

- **App shell:** collapsible sidebar grouped into Overview, Inventory, Purchasing, Sales, AI Agents, Insights and Settings; top bar with page title, search/⌘K, live agent indicator, model chip, notifications, theme toggle and user menu.
- **Page header:** title, one-line description, primary action on the right, secondary actions in a menu.
- **Tables:** sticky header, comfortable/compact density toggle, right-aligned numbers, status pills, row click opens a detail drawer or page, pagination.
- **Forms:** sheets or dialogs for quick creation, full pages for complex forms; inline validation; sensible defaults; keyboard submit; unsaved-changes guard.
- **States:** every data view has designed loading (skeleton), empty (with a helpful next action) and error (with retry) states.
- **Feedback:** optimistic updates where safe, toasts with undo for reversible actions, confirmation for irreversible ones.
- **AI surfaces** show what was done and why: reasoning summary, the data used, the model name, streaming text, and live step status ("Checking stock levels…", "Comparing 3 suppliers…").
- **Charts:** minimal gridlines, muted axes, accent plus neutrals, clear tooltips, consistent across the app.
- **Responsive:** excellent at 1280–1920 px and fully usable on tablet and phone (the sidebar becomes a drawer, tables become stacked cards).
- **Accessible:** keyboard navigation, visible focus rings, semantic HTML, labeled controls.
- **First run:** an onboarding checklist (connect a model → review agents → run the first analysis) and friendly guidance when no AI provider is configured.

**Avoid:** purple or rainbow gradients, neon glows, heavy shadows, emoji icons, dashboards full of equal-weight widgets, inconsistent padding or radii, the default unstyled shadcn look, tiny low-contrast gray text, walls of text.

**Process:** in Phase 1, build the tokens and core components (Button, Input, Select, Card, Badge/StatusPill, Table, Tabs, Dialog, Sheet, Tooltip, Skeleton, EmptyState, KPI card, chart wrappers, AI marker) and a `/design` page showing them all in both themes. If you have a browser or screenshot tool, review every page at 1440, 1024 and 390 px in both themes and fix anything that falls short of this section before calling a phase done.

---

## 9. Quality bar

- **Errors:** typed application errors and a central handler; a consistent envelope `{ error: { code, message, details? } }`; no stack traces sent to the client; route-level error boundaries; clear, actionable messages for common failures (database down, Ollama not running, invalid API key, rate-limited, model lacks tool support).
- **API:** REST under `/api/v1`, Zod-validated input and output, server-side pagination, filtering and sorting, an SSE endpoint for realtime events, and OpenAPI docs generated from the schemas at `/api/docs`.
- **Performance:** indexes on hot paths, no N+1 queries, aggregate queries for dashboards, TanStack Query caching invalidated by SSE events, route-level code splitting, virtualized long lists.
- **Security:** argon2, httpOnly SameSite cookies, helmet, CORS locked to the app origin, rate-limited auth routes, RBAC enforced on the server, Zod validation everywhere, encrypted keys, nothing secret in logs or Git.
- **Tests (Vitest):** forecasting, reorder point / safety stock / EOQ, ABC–XYZ, anomaly detection, ledger invariants, tool-argument validation, provider adapters with mocked HTTP, and the agent loop with the mock provider (tool call → proposal → approval → execution); API integration tests for core routes. In the final phase, one Playwright smoke test of the main flow.
- **Code:** strict TypeScript, ESLint and Prettier, no unexplained `any`, small focused modules, comments only where the reason isn't obvious.

---

## 10. Documentation (also used for my project report and presentation)

- `README.md`: overview, features, prerequisites, Windows-friendly setup, running, demo logins, troubleshooting (Ollama not detected, database connection, rate limits).
- `docs/ARCHITECTURE.md`: Mermaid diagrams for the system architecture, the ER diagram, the LLM gateway, and the agent workflow sequence (Sentinel → Planner → approval → PO → receipt).
- `docs/AGENTS.md`: each agent's purpose, triggers, tools, outputs, and the formulas and algorithms it uses.
- `docs/DEMO_SCRIPT.md`: a 5–7 minute presentation walkthrough using the simulation panel.

---

## 11. Phases

0. Prerequisite check, `PLAN.md`, `CLAUDE.md`, questions → **stop for approval.**
1. Monorepo, tooling, env validation, Prisma schema and migrations, deterministic seed, auth and roles, design system, app shell, `/design` page → **stop for my UI review.**
2. Core inventory: products, categories, warehouses, stock ledger and operations, batches, suppliers, purchase orders with receiving, sales orders, cycle counts, audit log, dashboard v1.
3. LLM gateway: adapters, Ollama detection, model registry, encrypted keys, AI & models settings, connection tests, fallback, budgets and rate limits, usage log.
4. Agent runtime: tool registry, loop (native tools + JSON fallback), run recording, pg-boss schedules and event triggers, SSE, proposals and the approvals inbox, Agents hub with run timeline.
5. Analytics services with unit tests (forecasting, reorder, anomalies, ABC–XYZ, supplier scoring), then each agent with its prompt; the Assistant with streaming and confirmations.
6. Analytics pages, reports and PDF, notifications, command palette, import/export, simulation panel and scenarios.
7. Polish: every page checked against section 8 in both themes at three widths; loading, empty and error states; performance; accessibility; tests; docs; demo script. Then run the acceptance checklist.

**Stretch goals** (only after the checklist passes): smart document intake (upload a supplier invoice image or PDF → a vision-capable model extracts the lines → matched to the PO → proposed goods receipt); barcode/QR labels and webcam scanning; pulling Ollama models from the UI with a progress bar; email notifications; semantic product search with embeddings.

---

## 12. Acceptance checklist

- [ ] Fresh clone → README → running on Windows in under 10 minutes.
- [ ] With Ollama running, installed models appear in Settings within seconds with correct capability badges; selecting one makes the agents use it; stopping Ollama shows a clear status, and fallback behaves as configured.
- [ ] Each cloud provider works once its key is entered (test passes, models listed).
- [ ] Internet off, Ollama on: the whole app and every agent work.
- [ ] No model configured: the app works, rule-based alerts still appear, and AI features show setup guidance.
- [ ] Simulation *Festive rush* → alerts → draft POs in the approvals inbox → approve → receive → stock and supplier scores update, with no manual steps in between.
- [ ] Every button, link and menu works; no console errors or unhandled rejections; typecheck, lint and tests pass.
- [ ] Looks premium in light and dark at 1440, 1024 and 390 px.
- [ ] Documentation complete.
