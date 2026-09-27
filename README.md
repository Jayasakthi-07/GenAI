# Stockroom

**Automatic Inventory Management Using Agents**

Stockroom is a full-stack inventory system in which a team of AI agents monitors stock, forecasts demand, drafts
purchase orders, catches anomalies, scores suppliers and writes reports, while people approve consequential
actions. Everything runs on your computer: the web app, the API, PostgreSQL and (optionally) local models through
Ollama.

> Status: under active development. See [`docs/PLAN.md`](docs/PLAN.md) for the phase checklist.

## Prerequisites

| Tool              | Version                      | Windows install                                                     |
| ----------------- | ---------------------------- | ------------------------------------------------------------------- |
| Node.js           | 24 LTS                       | `winget install OpenJS.NodeJS.LTS`                                  |
| pnpm              | 12                           | `npm install -g pnpm`                                               |
| PostgreSQL        | 16 or newer (18 recommended) | `winget install -e --id PostgreSQL.PostgreSQL.18 --interactive`     |
| Ollama (optional) | latest                       | `winget install -e --id Ollama.Ollama`, then `ollama pull qwen3:8b` |
| Git               | any recent                   | `winget install Git.Git`                                            |

macOS and Linux work too (Homebrew / your package manager); every script is a Node script.

### Create the database (once)

In an **administrator** PowerShell, using the password you chose for the `postgres` superuser. Pick your own
password for the `stockroom` role:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET listen_addresses = 'localhost';" -c "CREATE ROLE stockroom LOGIN CREATEDB PASSWORD 'choose-a-password';" -c "CREATE DATABASE stockroom OWNER stockroom;"
Restart-Service postgresql-x64-18
```

`CREATEDB` lets the test suite create its own `stockroom_test` database. `listen_addresses = 'localhost'` keeps
PostgreSQL off the network.

## Setup

```bash
pnpm install
pnpm bootstrap      # creates .env, generates secrets, asks for the stockroom password
pnpm preflight      # checks Node, pnpm, PostgreSQL and Ollama, with fixes for anything missing
pnpm db:setup       # applies migrations and loads the demo dataset (about a minute)
pnpm dev            # API on http://127.0.0.1:4000, app on http://127.0.0.1:5173
```

Open **http://127.0.0.1:5173** and sign in with a demo account (the sign-in screen lists them in demo mode):

| Role    | Email                    | Password        |
| ------- | ------------------------ | --------------- |
| Admin   | `admin@kaveri.example`   | `stockroom2026` |
| Manager | `manager@kaveri.example` | `stockroom2026` |
| Staff   | `staff@kaveri.example`   | `stockroom2026` |

For a production-style run on one port: `pnpm build && pnpm start`, then open http://127.0.0.1:4000.

## Commands

| Command                                      | What it does                                                          |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                   | Server (auto-reload) and web app together; the web app proxies `/api` |
| `pnpm build` / `pnpm start`                  | Production build; Fastify serves the app and API on one port          |
| `pnpm db:setup`                              | Migrate and seed                                                      |
| `pnpm db:seed`                               | Reload the demo dataset (wipes application data)                      |
| `pnpm db:reset`                              | Drop everything, migrate, seed                                        |
| `pnpm check:ledger`                          | Verify every stock balance equals the sum of its ledger               |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | Quality checks                                                        |
| `pnpm preflight`                             | Diagnose the local setup                                              |

API documentation (OpenAPI) is served at **http://127.0.0.1:4000/api/docs** while the server runs.

## The demo dataset

A fictional South-Indian FMCG distributor, _Kaveri Distributors_: about 230 products in 10 categories
(dairy, bakery, snacks and packaged foods tracked by batch and expiry), 3 warehouses (Chennai, Bengaluru,
Hyderabad), 12 suppliers of varying reliability, 40 customers, and 18 months of daily sales with trend, weekly
seasonality, festivals (Diwali, Navratri, Onam, Pongal, Eid…) and promotions. It is generated from a fixed seed
(`SEED` in `.env`) relative to today's date, so every reset gives the same data.

Situations are planted for the agents to find on their first run: stockouts behind overdue purchase orders, items
about to run out, overstock, dead stock, batches close to expiry, demand spikes, repeated shrinkage, a cycle count
with variances, a short delivery invoiced above the PO price, a supplier price jump, and a supplier whose
reliability has recently dropped.

## Troubleshooting

- **"Can't reach PostgreSQL at 127.0.0.1:5432"**: start the service (admin PowerShell: `Start-Service postgresql-x64-18`).
- **"PostgreSQL rejected the password"**: fix `DATABASE_URL` in `.env` (special characters must be URL-encoded), or run `pnpm bootstrap` again.
- **"DATABASE_URL still contains CHANGE_ME"**: put the `stockroom` password into `.env`.
- **Port already in use**: another copy is running, or change `API_PORT` / `WEB_PORT` in `.env`.
- **Ollama not detected**: start the Ollama app, check http://127.0.0.1:11434/api/version, then `ollama pull qwen3:8b`.

## Documentation

- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md): the project brief
- [`docs/PLAN.md`](docs/PLAN.md): architecture, data model, agents, API and progress
