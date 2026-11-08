# Genuis: first-loop prototype

This is a local banking dashboard that turns explicit requests into UI changes. It includes a server-side Nessie adapter, planner/data/UI agent roles, declarative financial queries, streamed progress, generated React widgets, compilation/repair, isolated browser previews, persistence, and undo. Behavioral learning is intentionally outside this sprint.

## Run

From the `genuis` directory:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

If `.env` already exists, edit it instead of copying over it. Add your credentials only to `.env` at the project root, alongside `package.json`, then restart the server.

```dotenv
NESSIE_API_KEY=your_nessie_key
NESSIE_CUSTOMER_ID=the_customer_to_display
NESSIE_BASE_URL=https://prod-api.nessieisreal.com
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

Use the customer ID and API base URL for the Nessie instance that issued your key. The supplied SDK contains a legacy HTTP base URL; this app uses a configurable HTTPS endpoint. The default production URL has not been tested with your credentials. Only the configured customer's accounts are loaded. No live records are created, changed, or deleted.

`OPENROUTER_API_KEY` enables Nemotron through OpenRouter; `OPENROUTER_MODEL` can select another OpenRouter model slug. Do not place credentials in any `NEXT_PUBLIC_` variable.

## Demo modes

- No Nessie key: deterministic sample banking fixtures, visibly labeled **Sample data**.
- No OpenRouter key: a limited rule-based **Demo planner**, visibly labeled as having no model connected. This is for exercising the UI and does not demonstrate model intelligence.
- Either connection can be enabled independently.
- A configured key that fails does **not** silently fall back to fixtures or fake model output.
- `NESSIE_DEMO_MODE=true` deliberately selects fixtures even with a Nessie key. `false` requires Nessie configuration.

No keys are included in browser responses. Never share or commit your `.env` file.

## Try it

1. “Compare my spending by month.”
2. “Change this to a line chart.”
3. “Build a restaurant spending budget tracker with a $300 target for October.”
4. “Generate a custom interactive React component to explore my restaurant spending in October with an editable what-if target.”
5. “Change the theme to high contrast with larger text.”

The sample dataset covers August–October 2026. Use dates and categories present in your own Nessie dataset when connected. The demo planner only handles simple English examples; full interpretation uses Nemotron.

Use Undo to restore a prior version, Reset to restore the initial widgets, and the close button to remove a widget. The workspace and built-in budget targets persist in this browser. Generated components' internal React state currently lasts only while mounted. Reset does not delete any Nessie data.

## Architecture

```text
Browser dashboard
  -> POST /api/agent (prompt + current dashboard)
     -> load customer-scoped Nessie snapshot
     -> planner: classify change + choose target
     -> data agent: select declarative query
     -> query executor: filter, group, sum integer cents
     -> UI builder: configure registered widget OR generate JSX
     -> schema checks and component compilation
     -> up to two repair attempts per structured output/component
  <- NDJSON progress + proposed dashboard + snapshot
  -> custom components compile through POST /api/component
     and must mount in an isolated iframe before committing
  -> browser saves dashboard; previous version remains available for undo
```

Theme/removal operations skip unnecessary data/UI calls. Follow-ups carry the current dashboard and selected widget query; the app does not maintain a long-term user model. One change is active per browser at a time. The API is request-scoped, with no durable job queue.

### Main files

- `lib/server/nessie.ts`: read-only banking transport, response validation, customer scoping.
- `lib/server/model.ts`: configurable inference endpoint and JSON repair.
- `lib/server/orchestrator.ts`: three role handoffs and dashboard changes.
- `lib/contracts.ts`: validated plans, queries, widgets, and dashboard types.
- `lib/query.ts`: deterministic aggregation and cent-based totals.
- `lib/server/components.ts`: component checks, JSX compilation, React bundling.
- `components/dashboard.tsx`: banking workspace, progress stream, preview/commit, history.
- `components/generated-widget.tsx`: opaque-origin iframe with restrictive CSP.

## Verification

```powershell
npm test
npm run build
```

Tests exercise monetary totals, date filtering, customer scoping, the demo loop, generated code compilation, model output repair, API failures, and mocked Nessie transport. They do not require keys or send test traffic to external APIs.

## Prototype limits

This is intended to run locally. It has no authentication, durable storage, hosted multi-user isolation, or production rate limiting. Do not expose it as a public financial service. The iframe, CSP, and code checks reduce the generated component's capabilities; they do not prove arbitrary generated code safe. Mount checks do not prove every interaction correct. Runtime preview failures preserve the prior dashboard but do not yet trigger another model repair. Guardrail checks are not a complete prompt-injection defense.

The banking connection currently loads accounts, purchases, merchant categories, and bills. It does not load income or perform transfers, payments, or subscription cancellation. Local budget targets are planning tools, not bank-enforced limits. Partial banking failures are surfaced instead of presenting incomplete totals as complete.

The supplied `nessie-javascript-sdk` folder is untouched. The adapter follows its resource structure using modern asynchronous requests and validates live response shapes; alternate Nessie deployments may require adapter adjustments.
