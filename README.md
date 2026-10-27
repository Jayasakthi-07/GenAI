# Stockroom

**Automatic Inventory Management Using Agents**

Stockroom is a full-stack inventory system in which a team of AI agents watches stock, forecasts demand, drafts
purchase orders, catches anomalies, scores suppliers and writes the morning briefing, while people approve anything
consequential. Everything runs on your computer: the web app, the API, PostgreSQL and, optionally, local models
through Ollama. With no model at all it still works: the agents fall back to deterministic rules and say so.

The design rule throughout: **numbers come from code, judgment comes from the model.** Forecasts, reorder points,
anomaly scores and supplier scores are computed by tested, pure functions; the model reads those results through
tools, explains them, ranks them and proposes actions, which wait in an approvals inbox.

## Features

- **Inventory core:** products with images, categories, units and batches with expiry; three warehouses; a stock
  ledger in which every change is a movement with the balance after it; receiving, issuing, adjustments with
  reasons, write-offs, transfers, cycle counts; purchase orders with approval thresholds and partial receipts;
  sales orders with reservation and first-expiry-first-out fulfilment; a full audit log.
- **Seven agents:** Stock Sentinel, Replenishment Planner, Demand Forecaster, Anomaly Auditor, Supplier Analyst,
  Inventory Optimizer and Report Writer, plus the Assistant. Each runs on a schedule, on events and on demand,
  with a run timeline showing every tool call ([`docs/AGENTS.md`](docs/AGENTS.md)).
- **Approvals:** agents propose (purchase orders, transfers, cycle counts, price or parameter changes) and people
  decide. Each agent's autonomy is configurable: observe, recommend or act within limits.
- **Assistant:** a streaming chat that answers from live data with tables and charts, and turns requests into
  confirmation cards ("order 200 more rice for Chennai").
- **Insights:** a dashboard with the daily briefing, analytics (valuation, movements, ABC–XYZ, turnover, forecast
  accuracy, supplier performance, dead stock), daily and weekly reports with PDF and CSV export.
- **Any model:** Ollama and LM Studio locally; Google Gemini, OpenRouter, Groq, NVIDIA NIM, Cerebras, Mistral,
  GitHub Models and Hugging Face in the cloud. Routing, fallbacks, per-agent models, budgets and usage are
  settings. Keys are encrypted at rest and never sent back to the browser.
- **Live demo:** a simulator that sells and receives through the real services at an adjustable speed, scenarios
  (festive rush, supplier delay, shrinkage, demand drop) that make the agents react end to end, and a one-click
  reset.
- **Polish:** light and dark themes, works at phone width, keyboard navigation, notifications, a command palette
  (`Ctrl K`), and loading, empty and error states on every view.

## Prerequisites

| Tool              | Version                      | Windows install                                                     |
| ----------------- | ---------------------------- | ------------------------------------------------------------------- |
| Node.js           | 24 LTS                       | `winget install OpenJS.NodeJS.LTS`                                  |
| pnpm              | 12                           | `npm install -g pnpm`                                               |
| PostgreSQL        | 16 or newer (18 recommended) | `winget install -e --id PostgreSQL.PostgreSQL.18 --interactive`     |
| Ollama (optional) | latest                       | `winget install -e --id Ollama.Ollama`, then `ollama pull qwen3:8b` |
| Git               | any recent                   | `winget install Git.Git`                                            |

macOS and Linux work too (Homebrew or your package manager); every script is a Node script.

### Create the database (once)

In an **administrator** PowerShell, using the password you chose for the `postgres` superuser during installation.
Pick your own password for the `stockroom` role:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET listen_addresses = 'localhost';" -c "CREATE ROLE stockroom LOGIN CREATEDB PASSWORD 'choose-a-password';" -c "CREATE DATABASE stockroom OWNER stockroom;"
Restart-Service postgresql-x64-18
```

`CREATEDB` lets the test suite create its own `stockroom_test` database. `listen_addresses = 'localhost'` keeps
PostgreSQL off the network.

## Setup

```bash
git clone <this repository> stockroom
cd stockroom
pnpm install
pnpm bootstrap      # creates .env, generates secrets, asks for the stockroom password
pnpm preflight      # checks Node, pnpm, PostgreSQL and Ollama, with fixes for anything missing
pnpm db:setup       # applies migrations and loads the demo dataset (under a minute)
pnpm dev            # API on http://127.0.0.1:4000, app on http://127.0.0.1:5173
```

Open **http://127.0.0.1:5173** and sign in with a demo account (the sign-in screen lists them in demo mode):

| Role    | Email                    | Password        | Can                                                         |
| ------- | ------------------------ | --------------- | ----------------------------------------------------------- |
| Admin   | `admin@kaveri.example`   | `stockroom2026` | Everything, including users, AI keys and resetting the demo |
| Manager | `manager@kaveri.example` | `stockroom2026` | Operations, approvals, agents and the simulator             |
| Staff   | `staff@kaveri.example`   | `stockroom2026` | Day-to-day stock work and orders                            |

The dashboard opens with a three-step checklist: connect a model, review the agents, run the first analysis.

For a production-style run on one port: `pnpm build && pnpm start`, then open http://127.0.0.1:4000.

## Connecting a model

- **Ollama (local, free, offline):** install it, run `ollama pull qwen3:8b` (or any model with tool support), and
  Stockroom finds it within seconds. **Settings → AI & models** shows installed models with capability badges
  (tools, vision, thinking, context length) and which ones are loaded.
- **Cloud providers:** open **Settings → AI & models**, choose a provider, paste a key and press _Test_. Free
  tiers work: Gemini, OpenRouter (`:free` models), Groq, NVIDIA NIM, Cerebras, GitHub Models. Keys can also go in
  `.env` (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, …); one saved in the app takes precedence.
- **Routing:** pick a default model, fallbacks, "prefer local", and per-agent overrides. If nothing is reachable,
  agents use their rules and label the output **Rule-based — AI unavailable**.

## Presenting with the simulator

**Simulation** (managers and admins, demo mode) starts a live simulator: customers buy and suppliers deliver on
their own, recorded through the same services people use, at a speed from one simulated day every two minutes to
one every fifteen seconds. The scenarios make the agents react visibly; a festive rush, for example, runs: stock
falls → Stock Sentinel alerts → the Replenishment Planner drafts purchase orders → you approve → the simulator
sends and receives them → stock and supplier scores update. [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) is a
5–7 minute walkthrough.

**Reset demo data** (Simulation page, or **Settings → Import & export**; admins) reloads a fresh 18 months of
history ending yesterday in under a minute, keeping AI providers, routing and agent settings, and everyone's
session.

## Commands

| Command                                      | What it does                                                          |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                   | Server (auto-reload) and web app together; the web app proxies `/api` |
| `pnpm build` / `pnpm start`                  | Production build; Fastify serves the app and API on one port          |
| `pnpm db:setup`                              | Migrate and seed                                                      |
| `pnpm db:seed`                               | Reload the demo dataset (wipes everything, including AI settings)     |
| `pnpm db:seed -- --dry-run`                  | Simulate the dataset in memory and verify its invariants              |
| `pnpm db:reset`                              | Drop everything, migrate, seed                                        |
| `pnpm check:ledger`                          | Verify every stock balance equals the sum of its ledger               |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | Quality checks (unit and integration tests)                           |
| `pnpm test:e2e`                              | Browser smoke and accessibility tests in Microsoft Edge (app running) |
| `pnpm qa:screens`                            | Screenshots of every page at 1440/1024/390 px, light and dark         |
| `pnpm preflight`                             | Diagnose the local setup                                              |

API documentation (OpenAPI) is served at **http://127.0.0.1:4000/api/docs** while the server runs.

## The demo dataset

A fictional South-Indian FMCG distributor, _Kaveri Distributors_: about 230 products in 10 categories (dairy,
bakery, snacks and packaged foods tracked by batch and expiry), 3 warehouses (Chennai, Bengaluru, Hyderabad), 12
suppliers of varying reliability, 40 customers, and 18 months of daily sales with trend, weekly seasonality,
festivals (Diwali, Navratri, Onam, Pongal, Eid…) and promotions. It is generated from a fixed seed (`SEED` in
`.env`) relative to today's date, so every reset gives the same picture.

Situations are planted for the agents to find on their first run: stockouts behind overdue purchase orders, items
about to run out, overstock, dead stock, batches close to expiry, demand spikes, repeated shrinkage, a cycle count
with variances, a short delivery invoiced above the PO price, a supplier price jump, and a supplier whose
reliability has recently dropped.

## Architecture in brief

A pnpm monorepo: `apps/web` (React 19, Vite, TanStack Router and Query, Tailwind), `apps/server` (Fastify 5,
Prisma 7 on PostgreSQL, pg-boss for schedules, the agent runtime and the LLM gateway) and `packages/shared` (Zod
schemas, constants and formatters used by both). Routes validate and call one service; services hold the business
rules, check permissions and write the audit log in the same transaction; agents are just another client of the
services. Details and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Troubleshooting

- **"Can't reach PostgreSQL at 127.0.0.1:5432"**: start the service (admin PowerShell: `Start-Service postgresql-x64-18`).
- **"PostgreSQL rejected the password"**: fix `DATABASE_URL` in `.env` (special characters must be URL-encoded), or run `pnpm bootstrap` again.
- **"DATABASE_URL still contains CHANGE_ME"**: put the `stockroom` password into `.env`.
- **Port already in use**: another copy is running, or change `API_PORT` / `WEB_PORT` in `.env`.
- **Ollama not detected**: start the Ollama app, check http://127.0.0.1:11434/api/version, then `ollama pull qwen3:8b`. If Ollama listens elsewhere, set `OLLAMA_BASE_URL`. The status recovers on its own within 30 seconds of Ollama starting.
- **The model chip says "Rule-based"**: no enabled provider is reachable. Agents keep working with rules; connect a model in **Settings → AI & models**.
- **A cloud provider says "rate limited"**: free tiers have per-minute and per-day quotas. Stockroom waits and retries, then falls back to the next model in your routing; add a fallback or a local model to avoid gaps. Daily budgets per provider are in **Settings → AI & models**.
- **Agents are slow**: an 8B model on a laptop CPU takes 20–60 s per run. A GPU, a smaller model, or a fast cloud provider (Groq, Cerebras) speeds this up; scheduled runs skip the model when nothing changed.
- **Charts show no recent sales**: the demo history ends the day the data was loaded. Use **Reset demo data**, or start the simulator.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system architecture, data model, LLM gateway and agent workflow (Mermaid diagrams)
- [`docs/AGENTS.md`](docs/AGENTS.md): each agent's purpose, triggers, tools, outputs and algorithms
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): a 5–7 minute presentation walkthrough
- [`docs/PLAN.md`](docs/PLAN.md): architecture, data model, API, decisions and progress
- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md): the project brief
