# Demo script (5–7 minutes)

A walkthrough for presenting Stockroom live. It follows one story: a festive rush drains stock, the agents notice
and propose orders, a manager approves, deliveries arrive, and the numbers move. Everything shown is real: the
simulator records sales and receipts through the same services people use.

## Before you present (10 minutes ahead)

1. Start PostgreSQL and Ollama, then `pnpm dev`. Open http://127.0.0.1:5173 in a large window.
2. Sign in as **jayasakthi@pmu.example** (admin, password `stockroom2026`), open **Simulation** and press **Reset demo data**
   (under a minute). The Stock Sentinel, Demand Forecaster, Inventory Optimizer and Report Writer then take a
   first look; give them two or three minutes with a local model.
3. Sign out and sign in as **shaheer@pmu.example** (manager): the manager approves things, which is the point of
   the demo.
4. On **Simulation**, set the speed to **Fastest** (one simulated day every 15 seconds) so deliveries arrive while
   you talk.
5. Optional: open the bell and press _Mark all read_, so new notifications stand out.

If the room has no network, nothing changes: with Ollama everything runs on the laptop. With no model at all, the
same flow works with rule-based output (labelled as such).

## The walkthrough

### 0:00 · The problem and the dashboard (45 s)

> "A distributor with 250 products in three warehouses can't watch every shelf. Stockroom gives them a team of
> agents that watch, and people who decide."

- **Dashboard:** inventory value, revenue, fill rate and days of inventory; the attention strip (out of stock, need
  reordering, open orders, awaiting approval).
- **Latest briefing:** written this morning by the Report Writer. Point at the **AI · model** marker: everything
  written by a model says so and names the model.

### 0:45 · How an agent thinks (60 s)

- Open **Agents**: seven background agents plus the Assistant, each with a schedule, triggers and an autonomy level
  (observe, recommend, act).
- Open the **Stock Sentinel**, then its latest run. Walk the timeline: _Analysis_ (cover, lead times and reorder
  points computed by code), the model's tool calls, its findings, and the hand-off to the Replenishment Planner.

> "Numbers come from code; judgment comes from the model. The model never computes a reorder point; it reads one
> and decides what matters."

### 1:45 · Festive rush (90 s)

- Open **Simulation** and press **Start scenario** on **Festive rush**.
- Point at the top bar: the amber **Festive rush** pill (simulated activity is always marked), and agent activity
  ("Stock Sentinel is working").
- The stats count up: orders, units, revenue. Within about a minute: the bell rings with urgent alerts, and the
  Planner's proposals appear (**Your part** counter, Approvals badge).

### 3:15 · Approve and receive (75 s)

- Open **Approvals** and pick a purchase-order proposal. Show the rationale, **Data used** (cover, demand, lead time,
  supplier choice) and expected impact. The figures come from the Planner's analysis.
- Press **Approve**. The purchase order is created and approved in one step (the manager may approve orders).
- Open it from the proposal: within seconds the simulator marks it **Sent**, and after the supplier's lead time at
  this speed (20–60 s) it's **Received**. Open the product: stock went up, the ledger shows the receipt.
- The receipt triggers the **Supplier Analyst** and **Anomaly Auditor** (agent activity).

### 4:30 · Something goes wrong (45 s)

Pick one:

- **Shrinkage incident:** high-value stock goes missing at one warehouse. The **Anomaly Auditor** flags it and
  proposes a cycle count. Open the alert to show its explanation.
- **Supplier delay:** a supplier's open orders become overdue and deliveries stop. The **Supplier Analyst** lowers
  its score (**Analytics → Suppliers**).

### 5:15 · Ask the Assistant (60 s)

- Press **Ask** (or `Ctrl J`) and ask: _"What's most likely to run out in Coimbatore this week?"_ It answers from
  live data with a table.
- Then: _"Order 100 more of the first one."_ It replies with a **confirmation card**; nothing changes until you
  confirm, and then the change is made as you, with an audit entry.

### 6:15 · Insights and the report (45 s)

- **Analytics → Forecast:** the last four weeks of actual sales and the next four forecast, with the 80 % likely
  range, plus accuracy per method.
- **Analytics → ABC–XYZ:** click a cell to drill into its products.
- **Reports:** open the daily briefing and press **PDF**.

> "Everything here runs on this laptop: no cloud required, any model you like, and every change audited."

## If something doesn't go to plan

- **The model is slow:** an 8B model takes 20–60 s per run on a laptop CPU. Keep talking over the timeline; or switch
  to a fast cloud model in **Settings → AI & models** before presenting.
- **No proposals yet:** the Sentinel collects stock events for a minute before it runs. Press **Run now** on the
  Stock Sentinel, or show an existing run while you wait.
- **A delivery hasn't arrived:** only orders sent while the simulator runs arrive automatically. Check the speed
  (Fastest) and the order's expected date.
- **Start over:** **Reset demo data** restores the starting point in under a minute, keeping the AI settings.
- **Show resilience:** quit Ollama. Within 30 seconds the model chip turns to **Rule-based**, agents keep producing
  labelled rule-based output, and it recovers by itself when Ollama starts again.
