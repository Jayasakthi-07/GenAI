# Architecture

Stockroom is a localhost-only monorepo: a React single-page app, a Fastify API with the agent runtime and LLM
gateway inside it, PostgreSQL, and optional local or cloud models. This document shows how the parts fit; the
data model, API list and phase decisions are in [`PLAN.md`](PLAN.md), and each agent is described in
[`AGENTS.md`](AGENTS.md).

## System

```mermaid
flowchart LR
  subgraph Browser["Browser · 127.0.0.1:5173 (dev) or :4000"]
    SPA["React SPA<br/>TanStack Router + Query<br/>Tailwind design system"]
  end

  subgraph Server["Fastify API · 127.0.0.1:4000"]
    Routes["Routes /api/v1<br/>Zod in → one service call → Zod out"]
    Services["Services<br/>business rules · permissions · audit"]
    Bus(["Typed event bus<br/>(after commit)"])
    SSE["SSE hub<br/>/api/v1/events"]
    Orch["Agent orchestrator<br/>schedules · debounced triggers · hand-offs"]
    Runtime["Agent runtime<br/>analyze → model loop → apply"]
    Analytics["Pure analytics<br/>forecasting · reorder · anomalies · ABC–XYZ · scores"]
    Gateway["LLM gateway<br/>routing · fallback · budgets · usage"]
    Sim["Simulator<br/>(demo mode)"]
    Notif["Notifications"]
  end

  subgraph Data["PostgreSQL · 127.0.0.1:5432"]
    App[("public schema<br/>ledger · orders · agents · audit")]
    Boss[("pgboss schema<br/>job queues")]
  end

  subgraph Models["Models (optional)"]
    Ollama["Ollama / LM Studio<br/>local"]
    Cloud["Gemini · OpenRouter · Groq · NVIDIA<br/>Cerebras · Mistral · GitHub · HF"]
  end

  SPA -- "fetch JSON" --> Routes
  SPA -- "Assistant (NDJSON stream)" --> Routes
  SSE -- "events → invalidate queries" --> SPA
  Routes --> Services
  Services -- "Prisma 7 (UTC sessions)" --> App
  Services --> Bus
  Bus --> SSE
  Bus --> Orch
  Bus --> Notif
  Notif --> Services
  Orch -- "pg-boss" --> Boss
  Orch --> Runtime
  Runtime -- "tools call services" --> Services
  Runtime --> Analytics
  Runtime --> Gateway
  Sim -- "acts as the simulator" --> Services
  Gateway --> Ollama
  Gateway --> Cloud
```

The rules that hold everywhere:

- **Routes are thin.** They validate with the shared Zod schemas, call one service method and serialize the result.
  No route touches Prisma.
- **Services own the rules.** Every method receives an `Actor` (a person, an agent with its run ID, the system or
  the simulator), checks the permission, and writes an `AuditLog` row in the same transaction as the change.
- **Stock changes only through `InventoryService.recordMovement()`**: row locks, a ledger row with the balance
  after it, the balance update, the daily sales rollup and a refusal to go negative, in one transaction. A database
  CHECK is the backstop, and `pnpm check:ledger` verifies the invariants.
- **Events go out after commit** on a typed bus. The SSE hub forwards them to browsers (notifications only to
  their recipient), and the orchestrator turns them into agent runs.
- **Agents are clients of the services.** Their tools call the same methods people use; agents never touch the
  database directly, and anything consequential becomes a proposal.
- **Numbers come from code.** `apps/server/src/analytics/` is pure and unit-tested; models read its results.

## Data model (core)

```mermaid
erDiagram
  CATEGORY ||--o{ PRODUCT : groups
  UNIT ||--o{ PRODUCT : measures
  PRODUCT ||--o{ STOCK_LEVEL : "held as"
  WAREHOUSE ||--o{ STOCK_LEVEL : holds
  PRODUCT ||--o{ STOCK_MOVEMENT : "changes by"
  WAREHOUSE ||--o{ STOCK_MOVEMENT : at
  BATCH |o--o{ STOCK_MOVEMENT : "draws on"
  REASON_CODE |o--o{ STOCK_MOVEMENT : explains
  PRODUCT ||--o{ BATCH : "tracked in"
  PRODUCT ||--o{ SALES_DAILY : "rolled up in"

  SUPPLIER ||--o{ SUPPLIER_PRODUCT : offers
  PRODUCT ||--o{ SUPPLIER_PRODUCT : "bought as"
  SUPPLIER ||--o{ PURCHASE_ORDER : receives
  PURCHASE_ORDER ||--|{ PURCHASE_ORDER_LINE : contains
  PURCHASE_ORDER ||--o{ GOODS_RECEIPT : "delivered by"
  GOODS_RECEIPT ||--|{ GOODS_RECEIPT_LINE : contains

  CUSTOMER ||--o{ SALES_ORDER : places
  SALES_ORDER ||--|{ SALES_ORDER_LINE : contains
  TRANSFER ||--|{ TRANSFER_LINE : moves
  CYCLE_COUNT ||--|{ CYCLE_COUNT_LINE : counts

  AGENT_DEFINITION ||--o{ AGENT_RUN : runs
  AGENT_RUN ||--o{ AGENT_STEP : records
  AGENT_RUN |o--o{ AGENT_ACTION : proposes
  AGENT_RUN |o--o{ ALERT : raises
  PRODUCT ||--o{ FORECAST : "forecast as"
  AGENT_RUN |o--o{ REPORT : writes

  USER ||--o{ SESSION : "signs in with"
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ CHAT_CONVERSATION : owns
  PROVIDER_CONFIG ||--o{ MODEL_CAPABILITY : lists
  PROVIDER_CONFIG ||--o{ LLM_CALL : serves
```

All tables use UUIDv7 keys, snake_case names and `timestamptz` columns. Money is `numeric` in the database,
`decimal.js` in services and a string in JSON. `v_stock_positions` is a view joining balances, open orders and
28-day demand into each position's state (out, low, on order, OK, over). `AuditLog` records every mutation with
its actor; `LlmCall` records every model attempt with tokens, latency and outcome.

## LLM gateway

```mermaid
flowchart TB
  Caller["Agent runtime or Assistant<br/>chat(messages, tools, agentKey)"] --> Resolve
  subgraph Gateway["LlmGateway (ai/gateway)"]
    Resolve["Resolve candidates<br/>override → per-agent → default → fallbacks<br/>(auto-pick a local tool model if none set)"]
    Budget{"Within budget<br/>and rate limit?"}
    Call["Provider adapter<br/>Ollama · OpenAI-compatible · Gemini · Mock"]
    Retry{"Retryable?<br/>429 / 5xx / timeout"}
    Next["Next candidate"]
    Record["Record LlmCall<br/>tokens · latency · status"]
    Health["Mark provider health<br/>(SSE ai.status)"]
  end
  Resolve --> Budget
  Budget -- yes --> Call
  Budget -- no --> Next
  Call -- ok --> Record
  Call -- error --> Retry
  Retry -- "yes: backoff with jitter,<br/>honour Retry-After" --> Call
  Retry -- "no / exhausted" --> Next
  Next --> Budget
  Call --> Health
  Next -- "none left" --> Rules["Caller falls back to rules<br/>(Rule-based — AI unavailable)"]
  Monitor["Health monitor (30 s)<br/>local providers"] --> Health
```

- Nothing outside `ai/gateway` imports an adapter; changing provider or model is a settings change.
- Tool calling uses native function calling when the model supports it, and a strict JSON protocol otherwise.
  Answers are validated with Zod and repaired once before falling back.
- Keys are AES-256-GCM encrypted at rest, returned to the browser only as their last four characters, and redacted
  from logs.

## Agent run

```mermaid
flowchart LR
  T["Trigger<br/>schedule · event window · manual · hand-off"] --> Q["pg-boss queue<br/>(one run per agent)"]
  Q --> A["1 · Analyze (code)<br/>facts, fingerprint,<br/>rule-based output"]
  A --> F{"Fingerprint<br/>changed?"}
  F -- "no (scheduled/event)" --> N["NO_CHANGE<br/>(no model call)"]
  F -- yes --> M["2 · Model loop<br/>read tools · write tools → proposals"]
  M --> G["3 · Grounding check<br/>summary must cite the facts"]
  G --> P["4 · Apply<br/>alerts · forecasts · scores · reports"]
  M -.->|no model or failure| R["Rule-based output"]
  R --> P
  P --> H["5 · Deterministic hand-offs"]
  H --> Done["Run recorded<br/>steps · tokens · summary"]
```

## Sentinel → Planner → approval → purchase order → receipt

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Sales (people or simulator)
  participant Inv as InventoryService
  participant Bus as Event bus
  participant Orch as Orchestrator
  participant Sen as Stock Sentinel
  participant Plan as Replenishment Planner
  participant Act as ActionService
  actor Mgr as Manager
  participant PO as PurchaseOrderService
  participant Sup as Supplier Analyst

  Customer->>Inv: fulfil sales order (recordMovement)
  Inv-->>Bus: stock.changed (after commit)
  Bus->>Orch: collect events for 60 s
  Orch->>Sen: run (EVENT)
  Sen->>Sen: analyze positions, cover, lead times (code)
  Sen->>Sen: model explains and ranks via tools
  Sen-->>Bus: alert.created (low stock, stockouts)
  Sen->>Orch: hand-off urgent products
  Orch->>Plan: run (HANDOFF)
  Plan->>Plan: reorder point, EOQ, MOQ, budget fill (code)
  Plan->>Act: propose_purchase_order (tool)
  Act-->>Bus: action.created (PENDING) → notification
  Mgr->>Act: approve in the Approvals inbox
  Act->>PO: create, submit, approve (as the manager)
  PO->>PO: send to supplier (person, or simulator in demo mode)
  PO->>Inv: receive goods (recordMovement per line)
  Inv-->>Bus: po.received, stock.changed
  Bus->>Orch: triggers
  Orch->>Sup: supplier scores update
  Orch->>Sen: next check sees the cover restored
```

## Front end

- **Routing and data:** TanStack Router (file routes, code-split per page) and TanStack Query with keys from
  `lib/query-keys.ts`. One `EventSource` feeds a single map from server event to the queries it makes stale, plus
  live stores for agent step labels, the simulator and notification pop-ups.
- **Design system:** tokens in `styles/globals.css` (light and dark), Radix primitives restyled, Lucide icons,
  tabular numerals for figures, and every data view with skeleton, empty and error states. `pnpm qa:screens`
  captures every page at three widths in both themes; `pnpm test:e2e` runs smoke and axe accessibility checks.
- **Forms:** react-hook-form with the shared Zod schemas, so the browser and the server validate the same way.

## Operations

- Everything binds to `127.0.0.1`; the UI loads nothing from the internet (fonts and icons are bundled). The only
  outbound calls go to cloud model providers you enable.
- Database sessions run in UTC. Day-based figures use the organization's time zone and complete days.
- `DEMO_MODE=true` enables the simulator and the one-click reset, which reloads the seed (about 47 s) while
  keeping AI and agent settings, sessions and preferences.
