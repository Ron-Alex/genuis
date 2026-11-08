import { test } from "node:test";
import assert from "node:assert/strict";
import { initialDashboard, querySchema, type RunEvent } from "../lib/contracts";
import { demoSnapshot } from "../lib/demo";
import { executeQuery } from "../lib/query";
import { runAgents } from "../lib/server/orchestrator";
import { bundleComponent, checkComponent } from "../lib/server/components";
import { loadBankSnapshot } from "../lib/server/nessie";

test("financial aggregation uses cents and excludes pending/cancelled purchases", () => {
  const snapshot = demoSnapshot();
  snapshot.purchases = [0.1, 0.2, 99, 50].map((amount, i) => ({ id: String(i), accountId: "demo-checking", date: "2026-10-01", merchant: "Test", category: "Restaurants", amount, status: ["completed", "completed", "pending", "cancelled"][i] }));
  const result = executeQuery(snapshot, { source: "purchases", groupBy: "category" });
  assert.equal(result.total, .3); assert.equal(result.count, 2);
});
test("date/category filters are inclusive and month series are chronological", () => {
  const result = executeQuery(demoSnapshot(), { source: "purchases", groupBy: "month", category: "Restaurants", from: "2026-09-01", to: "2026-10-31" });
  assert.deepEqual(result.rows.map(r => r.label), ["2026-09", "2026-10"]); assert.equal(result.count, 12);
  assert.ok(result.total > 0);
});
test("queries cannot escape the selected customer's accounts", () => {
  assert.throws(() => executeQuery(demoSnapshot(), { source: "purchases", groupBy: "month", accountId: "other-customer" }), /not part/);
});
test("invalid ranges are rejected and empty data returns zero", () => {
  assert.equal(querySchema.safeParse({ from: "2026-11-01", to: "2026-09-01" }).success, false);
  const result = executeQuery(demoSnapshot(), { source: "purchases", groupBy: "category", category: "Missing" });
  assert.equal(result.total, 0); assert.equal(result.count, 0); assert.deepEqual(result.rows, []);
});
test("demo loop produces a budget widget without mutating the existing dashboard", async () => {
  const key = process.env.NVIDIA_API_KEY; delete process.env.NVIDIA_API_KEY;
  try {
    const events: RunEvent[] = [], dashboard = structuredClone(initialDashboard);
    const result = await runAgents("Build a restaurant budget with a $300 target for October", dashboard, demoSnapshot(), e => events.push(e));
    assert.equal(dashboard.widgets.length, 2); assert.equal(result.dashboard.widgets.length, 3);
    const widget = result.dashboard.widgets.at(-1)!;
    assert.equal(widget.kind, "budget"); assert.equal(widget.budget, 300); assert.equal(widget.query.category, "Restaurants");
    assert.equal(widget.query.from, "2026-10-01"); assert.equal(widget.query.to, "2026-10-31");
    assert.equal(result.engine, "demo"); assert.ok(events.some(e => e.stage === "validation"));
  } finally { if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("theme changes preserve widgets and their queries", async () => {
  const key = process.env.NVIDIA_API_KEY; delete process.env.NVIDIA_API_KEY;
  try {
    const result = await runAgents("High contrast theme and larger text", structuredClone(initialDashboard), demoSnapshot(), () => {});
    assert.equal(result.dashboard.theme, "contrast"); assert.equal(result.dashboard.largeText, true);
    assert.deepEqual(result.dashboard.widgets, initialDashboard.widgets);
  } finally { if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("novel component path compiles real JSX and bundles React without execution", async () => {
  const key = process.env.NVIDIA_API_KEY; delete process.env.NVIDIA_API_KEY;
  try {
    const result = await runAgents("Generate a custom restaurant tracker for October", structuredClone(initialDashboard), demoSnapshot(), () => {});
    const component = result.dashboard.widgets.at(-1)!;
    assert.equal(component.kind, "custom"); assert.ok(component.code);
    const script = await bundleComponent(component.code!);
    assert.ok(script.length > 10000); assert.ok(script.includes("genuis-widget-ready"));
  } finally { if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("component gate rejects syntax errors, imports, raw HTML and networking", async () => {
  for (const source of ["function GeneratedWidget(){ return <div> }", "import x from 'fs'; function GeneratedWidget(){return null}", "function GeneratedWidget(){fetch('https://bad.test');return null}", "function GeneratedWidget(){return <div dangerouslySetInnerHTML={{__html:'bad'}}/>}"]) {
    await assert.rejects(() => checkComponent(source));
  }
});
test("configured Nemotron repairs invalid structured output and never uses demo logic", async () => {
  const originalFetch = globalThis.fetch, key = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key";
  let calls = 0;
  const outputs = ["not-json", JSON.stringify({ operation: "theme", title: "Theme", explanation: "Updated", theme: "dark", kind: "bar" })];
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: outputs[calls++] } }] }), { headers: { "Content-Type": "application/json" } });
  try {
    const result = await runAgents("Dark theme", structuredClone(initialDashboard), demoSnapshot(), () => {});
    assert.equal(result.engine, "nemotron"); assert.equal(result.dashboard.theme, "dark"); assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("Nemotron endpoint errors do not silently fall back to a fake success", async () => {
  const originalFetch = globalThis.fetch, key = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key"; globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });
  try { await assert.rejects(() => runAgents("Add a chart", structuredClone(initialDashboard), demoSnapshot(), () => {}), /401/); }
  finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("three Nemotron roles hand off a real query and UI specification", async () => {
  const originalFetch = globalThis.fetch, key = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key";
  const outputs = [
    { operation: "add", title: "Dining in October", explanation: "Created your restaurant breakdown.", kind: "bar" },
    { source: "purchases", groupBy: "merchant", category: "Restaurants", from: "2026-10-01", to: "2026-10-31" },
    { title: "Dining in October", subtitle: "Restaurant purchases by merchant", accent: "mint" },
  ];
  const roles: string[] = [];
  globalThis.fetch = async (_input, options) => {
    const body = JSON.parse(String(options?.body));
    roles.push(body.messages[0].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify(outputs.shift()) } }] });
  };
  try {
    const result = await runAgents("Show restaurant purchases by merchant for October", structuredClone(initialDashboard), demoSnapshot(), () => {});
    const widget = result.dashboard.widgets.at(-1)!;
    assert.equal(result.engine, "nemotron"); assert.equal(widget.accent, "mint");
    assert.equal(executeQuery(demoSnapshot(), widget.query).count, 6);
    assert.equal(roles.length, 3);
    assert.match(roles[0], /Planner/); assert.match(roles[1], /Data agent/); assert.match(roles[2], /UI builder/);
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key; }
});
test("Nessie adapter scopes requests and normalizes SDK-shaped records", async () => {
  const originalFetch = globalThis.fetch;
  const original = { key: process.env.NESSIE_API_KEY, customer: process.env.NESSIE_CUSTOMER_ID, demo: process.env.NESSIE_DEMO_MODE };
  process.env.NESSIE_API_KEY = "test-only-secret"; process.env.NESSIE_CUSTOMER_ID = "selected"; process.env.NESSIE_DEMO_MODE = "false";
  const paths: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); paths.push(url.pathname);
    assert.equal(url.searchParams.get("key"), "test-only-secret");
    const response = url.pathname === "/customers/selected/accounts" ? [{ _id: "a", type: "Checking", nickname: "Checking", balance: 100 }]
      : url.pathname === "/accounts/a/purchases" ? [{ _id: "p", merchant_id: "m", purchase_date: "2026-10-01", amount: 12.34, status: "completed" }]
      : url.pathname === "/accounts/a/bills" ? [{ _id: "b", payee: "Internet", payment_date: "2026-11-12", payment_amount: 60, status: "pending" }]
      : { _id: "m", name: "Cafe", category: ["Restaurants"] };
    return Response.json(response);
  };
  try {
    const snapshot = await loadBankSnapshot();
    assert.equal(snapshot.mode, "nessie"); assert.equal(snapshot.purchases[0].category, "Restaurants"); assert.equal(snapshot.bills[0].amount, 60);
    assert.deepEqual(paths.sort(), ["/accounts/a/bills", "/accounts/a/purchases", "/customers/selected/accounts", "/merchants/m"]);
    assert.ok(!JSON.stringify(snapshot).includes("test-only-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({ NESSIE_API_KEY: original.key, NESSIE_CUSTOMER_ID: original.customer, NESSIE_DEMO_MODE: original.demo })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
