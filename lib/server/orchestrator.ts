import { z } from "zod/v4";
import { planSchema, querySchema, widgetSchema, type BankSnapshot, type ChangePlan, type Dashboard, type DataQuery, type RunEvent, type RunResult } from "../contracts";
import { executeQuery } from "../query";
import { checkComponent } from "./components";
import { modelJSON } from "./model";
import { configuration, PublicError } from "./nessie";

type Emit = (event: RunEvent) => void;
const budgetCode = `function GeneratedWidget({ data }) {
  const [target, setTarget] = React.useState(300);
  const percent = Math.min(100, data.total / Math.max(1, target) * 100);
  return <div style={{padding:20,fontFamily:'inherit'}}><p style={{color:'#7962d9',fontSize:12,fontWeight:700}}>YOUR OWN LITTLE PLAN</p><h2 style={{fontSize:32,margin:'14px 0'}}>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(data.total)}</h2><p>Spent across {data.count} purchases</p><label style={{display:'block',margin:'20px 0 12px'}}>Try a monthly target <input aria-label="Monthly target" type="number" min="1" value={target} onChange={e=>setTarget(Math.max(1,Number(e.target.value)))} style={{padding:10,border:'1px solid #ddd',borderRadius:8,width:100,marginLeft:12}} /></label><div style={{background:'#ede8fc',borderRadius:8,height:12}}><div style={{background:'#8b72e8',height:'100%',borderRadius:8,width:percent+'%'}} /></div><p style={{fontSize:13,color:'#777'}}>{Math.round(percent)}% of this what-if target. No bank limit is applied.</p></div>;
}`;

function demoPlan(prompt: string, dashboard: Dashboard): ChangePlan {
  const p = prompt.toLowerCase();
  if (/\b(transfer|pay|send money|cancel subscription|enforce)\b/.test(p)) return { operation: "clarify", title: "An analytical workspace", explanation: "This prototype builds views and local trackers; it does not move money or change bank-side controls.", kind: "bar", question: "I can build a view or a local tracker for that. What would you like to see?" };
  if (/theme|dark|contrast|larger|bigger text|light mode/.test(p)) return { operation: "theme", title: "A little easier on the eyes", explanation: "Updated your workspace appearance.", kind: "bar", theme: /contrast/.test(p) ? "contrast" : /dark/.test(p) ? "dark" : /light/.test(p) ? "light" : dashboard.theme, largeText: /larger|bigger/.test(p) ? true : dashboard.largeText };
  if (/remove|delete/.test(p)) {
    const target = dashboard.widgets.find(w => p.includes(w.title.toLowerCase())) || dashboard.widgets.at(-1);
    return { operation: "remove", title: "Remove a widget", explanation: "Removed the selected widget.", kind: "bar", targetId: target?.id };
  }
  const kind = /custom|generate|new component/.test(p) ? "custom" : /budget|target|limit/.test(p) ? "budget" : /table|list|transactions|bills/.test(p) ? "table" : /line|trend/.test(p) ? "line" : /donut|pie|categor/.test(p) ? "donut" : "bar";
  const update = /change|instead|replace|make (it|that|this)/.test(p);
  return { operation: update && dashboard.widgets.length ? "update" : "add", title: kind === "custom" ? "A tracker, made for you" : kind === "budget" ? "A little room to spend" : /bills/.test(p) ? "Your upcoming bills" : /compare|month/.test(p) ? "Spending, side by side" : "A fresh perspective", explanation: "Built a view from the available banking records.", kind, targetId: update ? dashboard.widgets.at(-1)?.id : undefined, budget: kind === "budget" ? Number(p.match(/\$?([0-9]+(?:\.[0-9]+)?)/)?.[1] || 300) : undefined };
}

function demoQuery(prompt: string, snapshot: BankSnapshot, previous?: DataQuery): DataQuery {
  const p = prompt.toLowerCase();
  const category = [...new Set(snapshot.purchases.map(t => t.category))].find(c => p.includes(c.toLowerCase()) || (c === "Restaurants" && /restaurant|dining|food out/.test(p)) || (c === "Subscriptions" && /subscription/.test(p)));
  const months = [...p.matchAll(/september|october|august|november/g)].map(m => ({ august: "08", september: "09", october: "10", november: "11" })[m[0] as "august"]);
  return { source: /bills/.test(p) ? "bills" : previous?.source || "purchases", groupBy: /month|compare|trend|line/.test(p) ? "month" : /merchant/.test(p) ? "merchant" : /bills|transactions|list/.test(p) ? "none" : previous?.groupBy || "category", category: category || previous?.category, from: months.length ? `2026-${months.sort()[0]}-01` : previous?.from, to: months.length ? `2026-${months.at(-1)}-${months.at(-1) === "09" || months.at(-1) === "11" ? "30" : "31"}` : previous?.to };
}

export async function runAgents(prompt: string, dashboard: Dashboard, snapshot: BankSnapshot, emit: Emit, signal?: AbortSignal): Promise<RunResult> {
  const engine = configuration().engine;
  const update = (stage: RunEvent["stage"], message: string, status: RunEvent["status"] = "running") => { signal?.throwIfAborted(); emit({ stage, message, status }); };
  update("planner", engine === "demo" ? "Demo planner is interpreting your request." : "Nemotron is planning your dashboard change.");
  const catalog = {
    accounts: snapshot.accounts.map(a => ({ id: a._id, nickname: a.nickname, type: a.type })),
    categories: [...new Set(snapshot.purchases.map(p => p.category))],
    dates: [...new Set(snapshot.purchases.map(p => p.date.slice(0, 7)))].sort(),
    sources: ["purchases", "bills", "accounts"],
  };
  const plan = engine === "demo" ? demoPlan(prompt, dashboard) : await modelJSON("Planner", "Plan exactly one dashboard change. Use clarify with a question when intent is ambiguous or requires unsupported money movement. Supported: add/update/remove a chart, table, local budget tracker, or custom React widget; theme tokens light/dark/contrast and largeText. Use custom for a genuinely novel visual or interactive component. Use targetId from existing widgets for update/remove. A local budget target never enforces a bank restriction. Never claim to transfer, pay, cancel, or set bank limits.", { prompt, dashboard: { ...dashboard, widgets: dashboard.widgets.map(({ code: _code, ...w }) => w) }, catalog }, planSchema, signal, m => update("validation", m));
  update("planner", plan.explanation, "done");
  if (plan.operation === "clarify") return { dashboard, message: plan.question || "What would you like this view to show?", engine, mode: snapshot.mode };
  const next: Dashboard = structuredClone(dashboard);
  next.version++;
  if (plan.operation === "theme") {
    if (plan.theme) next.theme = plan.theme;
    if (typeof plan.largeText === "boolean") next.largeText = plan.largeText;
  } else if (plan.operation === "remove") {
    if (!next.widgets.some(w => w.id === plan.targetId)) throw new PublicError("Select an existing widget to remove.", 422);
    next.widgets = next.widgets.filter(w => w.id !== plan.targetId);
  } else {
    if (plan.operation === "add" && next.widgets.length >= 12) throw new PublicError("Your workspace has 12 widgets. Remove one before adding another.", 422);
    const previous = next.widgets.find(w => w.id === plan.targetId);
    if (plan.operation === "update" && !previous) throw new PublicError("The planner selected a widget that no longer exists. Please retry.", 409);
    update("data", "Selecting banking records and an aggregation.");
    const query = engine === "demo" ? demoQuery(prompt, snapshot, previous?.query) : await modelJSON("Data agent", "Produce a declarative query for the user's requested view. Choose only available sources, categories, account IDs and dates. Use ISO dates, exact available category names, and groupBy month for chronological comparisons. Preserve existing filters for follow-up requests unless the user changes them. Account balances must not be treated as spending. No SQL, URLs, or executable code.", { prompt, plan, catalog, previousQuery: previous?.query }, querySchema, signal, m => update("validation", m));
    const data = executeQuery(snapshot, query);
    update("data", `Verified ${data.count} records; totals calculated in integer cents.`, "done");
    update("builder", plan.kind === "custom" ? "Building a new React component for this request." : "Composing the view and connecting its data.");
    const id = previous?.id || crypto.randomUUID();
    const base = { id, title: plan.title, subtitle: data.description, kind: plan.kind, query, accent: "purple" as const, budget: plan.budget || previous?.budget || (plan.kind === "budget" ? 300 : undefined) };
    const viewSchema = z.object({ title: z.string().min(1).max(100), subtitle: z.string().max(300), accent: z.enum(["purple", "mint", "blue", "orange"]), code: z.string().max(18000).optional() });
    let view = engine === "demo" ? { title: base.title, subtitle: base.subtitle, accent: base.accent, code: plan.kind === "custom" ? budgetCode : undefined } : await modelJSON("UI builder", "Design a widget. Return title, subtitle, accent. For kind custom also return code defining function GeneratedWidget({ data }) with JSX. React and hooks useState/useMemo/useEffect/useRef/useCallback are in scope. data={rows:[{label,value,count}],total,count,description,query}; read amounts from data, never hardcode financial figures. Use inline styles and accessible controls. No imports/exports, browser globals, networking, navigation, raw HTML, or external assets. Keep within 380px height. For other kinds omit code; use existing renderer.", { prompt, plan, dataShape: { fields: ["rows", "total", "count", "description", "query"], rowFields: ["label", "value", "count"] }, recordCount: data.count, previousComponent: previous?.code }, viewSchema, signal, m => update("validation", m));
    if (plan.kind === "custom") {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!view.code) throw new Error("The custom widget requires code.");
          await checkComponent(view.code); break;
        } catch (error) {
          if (engine === "demo" || attempt === 2) throw new PublicError("The generated component failed validation. Your previous dashboard was preserved.", 422);
          update("validation", "Repairing the component before preview.");
          view = await modelJSON("UI builder", "Repair the React component. Define function GeneratedWidget({ data }). React and hooks are in scope. Use only data props, inline styles and local React state. No imports/exports or browser globals. Return title, subtitle, accent, code.", { previous: view, error: error instanceof Error ? error.message.slice(0, 1500) : "Invalid JSX" }, viewSchema, signal);
        }
      }
    }
    const widget = widgetSchema.parse({ ...base, ...view, code: plan.kind === "custom" ? view.code : undefined });
    update("builder", plan.kind === "custom" ? "New component compiled; browser preview will check rendering." : "Widget is ready with verified data bindings.", "done");
    if (previous) next.widgets = next.widgets.map(w => w.id === previous.id ? widget : w);
    else next.widgets.push(widget);
  }
  update("validation", "Change validated. Keeping an undo version.", "done");
  return { dashboard: next, message: plan.explanation, engine, mode: snapshot.mode };
}
