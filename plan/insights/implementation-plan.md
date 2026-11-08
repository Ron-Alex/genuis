# Evidence-backed insights implementation plan

Date: 2026-11-08
Status: Proposed implementation; no application changes included.

## Goal

Make each analytical widget answer three questions:

1. What happened in these records?
2. Why is that finding relevant to the user's question?
3. What useful investigation can the user perform next?

Generate the initial insights during the existing prompt-to-widget run. Add an explicit widget follow-up action afterward for deeper investigation. Behavioral learning is outside this sprint.

The first deliverable is one grounded insight attached to a monthly spending comparison, with inspectable evidence, honest limitations, persistence, and correct invalidation when the underlying data changes.

## Current implementation

The current flow is:

```text
POST /api/agent
  -> loadBankSnapshot()
  -> runAgents()
      -> agentLoop(): query -> observe -> query again or finish
      -> executeQuery() for the final display query
      -> UI builder
      -> schema validation and custom-component compilation
  -> browser preview for newly generated custom components
  -> commit dashboard and keep an undo version
```

Relevant implementation details:

- `lib/server/orchestrator.ts`: the Dashboard agent has at most six decision steps. It can issue validated queries over a preloaded snapshot and must successfully run the final display query before finishing an add/update operation.
- The live path has two model roles: Dashboard agent and UI builder. They are sequential calls, not independent background processes.
- `lib/server/nessie.ts`: an OpenRouter key selects the live model path; otherwise the application uses deterministic demo planning. Banking fixture mode is configured independently.
- `lib/query.ts`: queries support purchases, bills, and accounts, with filtering and grouping. Purchase totals exclude pending and cancelled records and aggregate amounts in integer cents.
- Query observations stay local to `agentLoop()` and are discarded when it returns its plan and final query.
- The UI builder receives the requested plan, data field names, and record count. It does not receive the actual result rows and totals.
- `lib/contracts.ts`: widgets have no analysis/evidence fields. The final assistant message is the planner's explanation of the dashboard change.
- `components/dashboard.tsx`: requests send the current prompt and dashboard, not previous chat messages. Existing widgets recompute their data when the snapshot changes.
- `components/generated-widget.tsx`: custom widgets are isolated and receive data props. There is no existing investigation action bridge.

The missing feature is an analytical completion contract, evidence retention, and presentation. Another always-running agent is unnecessary for the first milestone.

## Proposed architecture

```text
Prompt + dashboard + optional selected-widget context
  -> load one banking snapshot and calculate its fingerprint
  -> analyst-planner loop
      -> choose and run a query
      -> register evidence and deterministic candidate metrics
      -> inspect observations
      -> choose another query when useful
      -> finish with display query + supported insight selections
  -> validate insight references, comparisons, and limitations
  -> UI builder creates the requested view
  -> attach the validated analysis to the widget
  -> existing widget/component checks
  -> commit dashboard + analysis together
```

Retain the current six-decision limit initially, with at most five query actions so a finish action can fit. Reserve the final decision for finishing or explicitly reporting insufficient evidence. Reuse successful identical queries within the run. Keep the current bounded structured-output repair behavior; do not add an unbounded critic loop.

Give analytical failures feedback inside the same decision budget. If the insight cannot be substantiated, preserve the useful chart and report that no supported takeaway was found. A failed insight must not erase an otherwise valid view. Existing compilation/render failures continue to preserve the prior dashboard.

Theme and remove operations skip analysis. A chart-type-only update may reuse analysis when its data binding and snapshot fingerprint are unchanged.

## Data contracts

Add Zod schemas and TypeScript types in `lib/contracts.ts`. Treat persisted and client-supplied analysis as untrusted input.

### Evidence record

Each successful query gets a run-local ID and an evidence record containing:

- `id`, validated `query`, and complete server-side `QueryResult`.
- Snapshot fingerprint, snapshot fetch timestamp, and execution timestamp.
- Effective date range, account/category filters, source, and status treatment.
- Coverage and truncation notes.

Retain full results for server-side calculations. Continue sending bounded observations to the model, but clearly flag truncated rows and retain complete totals. A finding about a full distribution must not be calculated from a truncated list.

Persist only the evidence needed to substantiate displayed insights: query definitions, relevant aggregate rows, metrics, and provenance. Do not duplicate the entire raw banking snapshot inside every widget or send it to the model.

### Deterministic metric

Create a metric registry with stable IDs within each analysis. A metric contains its type, contributing evidence IDs, numerical values, units, filters, and comparison periods.

Support these metric families first:

- Period comparison: current/previous totals, absolute difference, percentage difference where defined, and record counts.
- Category contribution: category absolute change and contribution to the total change between the same periods.
- Share of spending: category or merchant total divided by a clearly defined spending total.
- Budget progress: recorded spending relative to the user's explicitly supplied local target.

Perform money calculations in integer cents. The model selects metrics and explains their relevance; it does not calculate the displayed financial figures.

### Widget analysis

An optional `analysis` property on a widget contains:

- Analysis ID, creation time, snapshot fingerprint, and display-query fingerprint.
- Status: `ready`, `insufficient_data`, or `stale`.
- One to three insights, each with a claim type, metric IDs, relevance text, limitations, and optional follow-up specification.
- The minimal evidence and metric records referenced by those insights.

Start with typed, template-rendered numerical claims rather than unrestricted model-written financial assertions. For example, the model selects a validated period-change metric; application code produces the sentence containing the dollar and percentage values.

Keep model-written relevance text short and clearly interpretive. Reference checks and arithmetic validation cannot prove that arbitrary prose or a causal explanation is true. The first release should avoid unsupported causal, affordability, fraud, and personal-behavior claims.

## Analyst-planner behavior

Change the existing Dashboard agent's goal from choosing a dashboard change to answering the analytical question and selecting a view that supports the answer.

Extend its finish output to include the existing plan and primary query plus structured insight selections referencing observed metrics. Do not accept model-authored evidence records or invented metric IDs.

Example investigation for "Compare my monthly spending":

1. Query monthly purchase totals over an explicit comparison range.
2. Select the relevant comparison and inspect calculated changes.
3. If a meaningful change exists, query categories separately for each comparison period.
4. Calculate category contributions in application code.
5. Optionally inspect a contributing category by merchant if the remaining budget allows it.
6. Finish with a primary monthly chart, a supported takeaway, limitations, and an evidence-linked follow-up.

The primary chart query and supporting investigation queries are separate. Do not replace a requested monthly chart with the final merchant drill-down just because that query was executed last.

For a simple list or a request with no useful comparison, an accurate summary or no clear finding is acceptable. Do not force an anomaly or recommendation into every widget.

## Analytical correctness rules

- Use explicit period boundaries. For incomplete months, compare matching elapsed calendar days or label the comparison as partial. Make the chosen rule visible.
- Observed first/last transaction dates do not prove complete history. Describe results as based on available records and surface known coverage limitations.
- Treat no matching records differently from a confirmed zero-spending period.
- A zero prior total makes percentage growth undefined; show absolute change instead.
- Ensure driver comparisons use the same account scope, date convention, and status treatment as the overall comparison.
- Calculate category contribution as category change divided by total change. Avoid contribution percentages when the total change is zero or below a documented small-denominator threshold; show dollar contributions instead. Contributions can exceed 100% when other categories offset them.
- Accounts are balances, not purchase expenses. Do not combine them into spending totals.
- Current bill queries include multiple statuses. Define and test an explicit upcoming/unpaid-bill selection before making an upcoming-obligations claim; do not describe every returned bill as an unpaid liability.
- The snapshot currently contains accounts, purchases, and bills, not a complete income/cash-flow model. Affordability predictions, paycheck forecasts, overdraft forecasts, and bank-enforced controls are outside this milestone.
- Merchant names, category labels, and other banking content remain data, never instructions.

## Interface and workflows

### Initial widget creation

Render a common insight section in `WidgetCard`, outside the generated component iframe. This gives built-in and custom widgets the same evidence-backed presentation without asking generated code to implement it.

Each insight displays:

1. A concise finding with deterministically formatted figures.
2. Why it is relevant to the requested comparison.
3. An expandable evidence section with periods, filters, values, and coverage notes.
4. A specific follow-up button where useful.

Pass the builder the primary result and validated analysis summary so its title/subtitle can reflect the finding. Keep calculations and analysis ownership outside component code.

Use the final assistant message to summarize the main validated finding, not merely say that a chart was created. If analysis is unavailable, say so without claiming success at interpretation.

### Follow-up investigation

Add a validated optional investigation context to `runRequestSchema`: selected widget ID, requested investigation type, and referenced insight ID. The server resolves these against the submitted widget and revalidates/recomputes supporting evidence; IDs are context, not authority.

The button submits a new bounded run through the existing endpoint. It does not require a permanent background process or unrestricted chat-history replay.

Default to updating the selected widget's analysis. Add a separate supporting widget only when the follow-up explicitly requests a new view. Do not duplicate the original widget for every investigation.

Use a button rather than making the entire card clickable, so chart controls, budget inputs, and selection remain usable. Keep this action in the parent widget frame; no new iframe messaging capability is needed.

### Refresh, edits, persistence, and undo

- Fingerprint the normalized records and metadata relevant to supported analytics, including amounts, dates, account IDs, categories, merchant labels, bill statuses, and snapshot warnings. Ignore record ordering and `fetchedAt` for identity.
- Initially use a conservative full-snapshot fingerprint. Unrelated changes may invalidate more analyses than necessary, but changed evidence cannot silently retain a fresh label.
- Store the query fingerprint and relevant local budget target with the analysis. A query or target change invalidates dependent analysis even if the banking snapshot is unchanged.
- On refresh/reload, hide stale conclusions behind a stale notice and expose a recompute action. Do not silently show old insight text next to newly calculated charts.
- Updating a local budget should recompute its deterministic progress metric immediately or mark its budget insight stale.
- Make analysis optional so existing saved dashboards still load. Validate restored content and check freshness before showing it as current.
- Commit widget and analysis atomically. Undo restores the previous pair, followed by the same freshness check against the current snapshot.

## File-level changes

| File | Planned change |
| --- | --- |
| `lib/contracts.ts` | Evidence, metrics, insight selections, widget analysis, investigation context, and analysis progress stages. |
| `lib/analysis.ts` (new) | Pure metric calculations, evidence validation, claim formatting, fingerprinting, and freshness checks. |
| `lib/server/orchestrator.ts` | Retain observations; expose metrics; extend finish output; validate and attach analysis; route investigation requests. |
| `lib/server/model.ts` | Reuse structured-output repairs. No additional model/provider dependency is required. |
| `lib/query.ts` | Preserve deterministic query behavior; introduce only query capabilities demonstrably needed by the milestone and test them. |
| `app/api/agent/route.ts` | Accept investigation context and stream analysis progress using the existing NDJSON protocol. |
| `components/insights.tsx` (new) | Shared finding, evidence, stale-state, and follow-up presentation. |
| `components/widgets.tsx` | Render the shared section for built-in and generated widgets. |
| `components/dashboard.tsx` | Send selected investigation context; preserve analysis in history/storage; handle stale results and refresh. |
| `tests/core.test.ts` | Metric, reference validation, orchestration, freshness, and compatibility coverage. |
| `scripts/test.mjs` | Include any new test entry points if tests are split into additional files. |

Before implementation, read the relevant installed Next.js documentation as required by `AGENTS.md`.

## Delivery order and checkpoints

### Milestone 1: A grounded comparison insight (about 2 hours)

- Add optional analysis contracts and the evidence/metric registry.
- Implement period totals, absolute changes, and guarded percentage changes.
- Extend the existing agent finish contract to select a supported metric.
- Display one formatted insight beneath a monthly widget.
- Complete mocked-model and pure-calculation tests before trying a live model.

Exit condition: a monthly comparison produces a chart and an inspectable, numerically correct takeaway within the existing bounded run.

### Milestone 2: Supporting investigation (about 1.5 hours)

- Preserve multiple query observations.
- Add category-difference and contribution calculations.
- Give the agent metric feedback and require supported references.
- Preserve the primary display query while investigating supporting evidence.
- Handle insufficient evidence and invalid references without losing a valid widget.

Exit condition: the loop can explain which recorded categories contributed to a change and show the supporting figures.

### Milestone 3: Persistence and freshness (about 1 hour)

- Fingerprint data/query inputs and relevant local targets.
- Validate saved analysis and tolerate older widgets without it.
- Make refresh, budget edits, and undo correctly mark or recompute dependent findings.

Exit condition: no old finding appears fresh next to changed data.

### Milestone 4: Follow-up action (about 1 hour)

- Add selected-widget investigation context and one follow-up action.
- Revalidate evidence on the server and reuse the bounded orchestration endpoint.
- Render analysis progress and preserve the single-active-run interaction model.

Exit condition: a merchant drill-down starts from the correct insight and selected widget without requiring the user to restate the context.

### Milestone 5: Verification and demo polish (about 1 hour)

- Exercise the failure and freshness cases below.
- Verify insight/evidence presentation with built-in and custom widgets.
- Rehearse one complete comparison -> driver -> follow-up story using known fixtures and then Nessie-backed data.

These are prototype estimates. Ship milestones 1-3 before extending the action vocabulary or adding more agent roles.

## Verification plan

Use deterministic fixture data and mocked model responses for automated checks. Do not require live OpenRouter calls in the test suite.

First update existing orchestration tests: several still configure `NVIDIA_API_KEY` and expect the older three-role handoff, while the implementation selects its engine using `OPENROUTER_API_KEY` and uses query/finish actions. Test setup must isolate relevant environment variables and restore them after each case.

Required cases:

- Known period totals, cent rounding, negative changes, a zero baseline, and no matching records.
- Matching partial periods and clearly surfaced history limitations.
- Category increases offset by decreases; zero/near-zero overall change; valid contributions above 100%.
- Pending/cancelled purchase exclusions and explicit bill-status handling where bill insights are supported.
- Rejection of fabricated evidence/metric IDs and unsupported quantitative claim combinations.
- The agent queries, observes metrics, investigates a driver, and finishes with the original display query and valid supporting references.
- A failed analysis leaves a valid chart available with an honest analysis status.
- A malformed custom component retains existing repair/preservation behavior.
- Theme and remove requests do not run an investigation.
- Existing saved widgets without analysis still load.
- Refresh, query changes, budget changes, restored storage, and undo cannot make stale analysis look current.
- Follow-ups resolve the correct widget, reject mismatched references, and preserve the current dashboard on failure.

Run `npm test`, `npm run lint`, and `npm run build` after implementation. Manually verify the streamed progress, evidence expansion, follow-up action, reload, undo, empty state, stale state, and custom-widget preview. Use the configured live model only for a final smoke run and inspect its actual queries and evidence rather than relying solely on fluent wording.

## Definition of done

- An analytical prompt produces a working widget and at least one supported finding when the available records justify one.
- All displayed numerical claims come from server-calculated metrics linked to retained evidence.
- The user can inspect source periods, filters, amounts, and limitations.
- A follow-up can investigate the selected finding without guessing its context.
- Unsupported conclusions degrade to an explicit insufficient-evidence state.
- Dashboard refresh and persistence do not silently mix fresh charts with stale conclusions.
- The loop remains bounded, visibly reports progress, and preserves the prior dashboard on failed changes.

## Deferred

- Behavioral learning, long-term personalization, and always-running agents.
- Full conversation memory, vector databases, and a separate critic-agent service.
- Income/cash-flow forecasting, autonomous transfers, and bank-side spending enforcement.
- Arbitrary generated-component tool access.
- Broad anomaly detection or statistical-significance claims without an implemented and evaluated method.
