"use client";
import { useEffect, useRef, useState } from "react";
import { dashboardSchema, initialDashboard, type BankSnapshot, type Dashboard, type RunEvent, type RunResult } from "@/lib/contracts";
import { executeQuery } from "@/lib/query";
import { GeneratedWidget } from "./generated-widget";
import { Icon } from "./icon";
import { money, WidgetCard } from "./widgets";

const suggestions = [
  { icon: "activity", label: "Compare my monthly spending", prompt: "Compare my spending by month" },
  { icon: "wallet", label: "Build a restaurant budget", prompt: "Build a restaurant spending budget tracker with a $300 target for October" },
  { icon: "code", label: "Generate a custom tracker", prompt: "Generate a custom interactive React component to explore my restaurant spending in October with an editable what-if target" },
  { icon: "sparkle", label: "Try a high contrast theme", prompt: "Change the theme to high contrast with larger text" },
];
type Message = { role: "user" | "assistant"; text: string };
type Pending = { result: RunResult; snapshot: BankSnapshot };
const storageKey = "genuis-workspace-v1";

export function BankingDashboard() {
  const [snapshot, setSnapshot] = useState<BankSnapshot | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>(initialDashboard);
  const [history, setHistory] = useState<Dashboard[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("overview");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const messageEnd = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/banking"); const data = await response.json();
      if (!response.ok) throw new Error(data.error); setSnapshot(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect to banking data."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) { const parsed = dashboardSchema.safeParse(JSON.parse(saved)); if (parsed.success) setDashboard(parsed.data); }
    } catch { /* Storage can be unavailable in private browsing. */ }
    setReady(true); void refresh();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(storageKey, JSON.stringify(dashboard)); } catch { /* Keep the session usable without storage. */ }
  }, [dashboard, ready]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, events]);

  function commit(next: Dashboard) { setHistory(h => [...h.slice(-9), dashboard]); setDashboard(next); }
  function finish(value: Pending) {
    if (value.result.dashboard.version !== dashboard.version) commit(value.result.dashboard);
    setSnapshot(value.snapshot);
    setMessages(m => [...m, { role: "assistant", text: value.result.message }]);
    setEvents(e => [...e, { stage: "complete", message: "Your workspace is ready.", status: "done" }]);
    setPending(null); setBusy(false);
  }
  async function submit(text: string) {
    if (busy || text.trim().length < 3 || !snapshot) return;
    setPrompt(""); setError(""); setBusy(true); setEvents([]);
    setMessages(m => [...m.slice(-11), { role: "user", text }]);
    const abort = new AbortController(); controller.current = abort;
    let finished = false;
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, dashboard }), signal: abort.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "This request could not be completed."); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The server did not return a progress stream.");
      const decoder = new TextDecoder(); let buffer = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const item = JSON.parse(line);
        if (item.type === "event") setEvents(e => [...e, item.event]);
        if (item.type === "error") throw new Error(item.error);
        if (item.type === "result") {
          finished = true;
          const value = { result: item.result as RunResult, snapshot: item.snapshot as BankSnapshot };
          const custom = value.result.dashboard.widgets.find(w => w.kind === "custom" && w.code && dashboard.widgets.find(old => old.id === w.id)?.code !== w.code);
          if (custom) {
            setEvents(e => [...e, { stage: "validation", message: "Checking the new component in an isolated browser preview.", status: "running" }]);
            setPending(value);
          } else finish(value);
        }
      };
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) { processLine(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      }
      buffer += decoder.decode(); if (buffer.trim()) processLine(buffer);
      if (!finished) throw new Error("The connection ended before the change was completed.");
    } catch (error) {
      setError(abort.signal.aborted ? "Change cancelled. Your dashboard was preserved." : error instanceof Error ? error.message : "Something went wrong.");
      setPending(null); setBusy(false);
    } finally { controller.current = null; }
  }

  const accounts = snapshot?.accounts || [];
  const cash = accounts.filter(a => a.type !== "Credit Card").reduce((sum, a) => sum + Math.round(a.balance * 100), 0) / 100;
  const purchases = (snapshot?.purchases || []).filter(p => `${p.merchant} ${p.category} ${p.date}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const custom = pending?.result.dashboard.widgets.find(w => w.kind === "custom" && w.code && dashboard.widgets.find(old => old.id === w.id)?.code !== w.code);
  const dateRange = snapshot?.purchases.length ? [...snapshot.purchases.map(p => p.date)].sort() : [];
  const formatMonth = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const cancel = () => { controller.current?.abort(); setPending(null); setBusy(false); setError("Change cancelled. Your dashboard was preserved."); };

  return <div className={`app-shell theme-${dashboard.theme} ${dashboard.largeText ? "large-text" : ""}`}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Genuis home"><span className="brand-mark">g<span>✦</span></span><span>genuis<span className="brand-period">.</span></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">{[{ id: "overview", name: "Overview", icon: "grid" }, { id: "activity", name: "Transactions", icon: "activity" }, { id: "bills", name: "Bills & payments", icon: "bill" }].map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.name}</span>{view === item.id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="note-sparkle"><Icon name="sparkle" size={24} /></span><h3>A bank that fits you.</h3><p>Your ideas become the tools you need. Just ask.</p><span className="prototype-label">HACKUTD 2026 · PROTOTYPE</span></div>
      <div className="sidebar-profile"><div className="avatar">{snapshot?.mode === "nessie" ? "YO" : "AM"}</div><div><strong>{snapshot?.customer || "Your workspace"}</strong><span>Personal workspace</span></div><span className="profile-status" /></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Personal banking <Icon name="chevron" size={12} /><strong>{view === "overview" ? "Overview" : view === "activity" ? "Transactions" : "Bills & payments"}</strong></div><div className="topbar-right"><button type="button" className="theme-toggle" aria-label={dashboard.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={dashboard.theme === "dark" ? "Light mode" : "Dark mode"} onClick={() => setDashboard((d) => ({ ...d, theme: d.theme === "dark" ? "light" : "dark" }))}>{dashboard.theme === "dark" ? "☀" : "☾"}</button><span className={`connection-pill ${snapshot?.mode === "nessie" ? "connected" : ""}`}><i />{snapshot?.mode === "nessie" ? "Nessie connected" : "Sample data"}</span><span className="small-avatar">{snapshot?.mode === "nessie" ? "YO" : "AM"}</span></div></header>
      <div className="workspace-body">
        <main className="main-content">
          <div className="page-heading"><div><div className="eyebrow">A LITTLE CLARITY FOR YOUR EVERYDAY</div><h1>{view === "overview" ? "Your money, your way." : view === "activity" ? "The little details." : "One less thing to remember."}</h1><p>{view === "overview" ? "A workspace that takes shape around what you need." : view === "activity" ? "Every purchase, all in one place." : "Your bills, together in one simple view."}</p></div><button className="date-badge" onClick={() => void refresh()} disabled={busy || loading} title="Refresh banking data"><Icon name="calendar" size={16} />{dateRange.length ? `${formatMonth(dateRange[0])} — ${formatMonth(dateRange.at(-1)!)}` : "Refresh data"}<Icon name="reset" size={13} /></button></div>
          {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
          {snapshot && (snapshot.mode === "demo" || snapshot.engine === "demo") && <div className="demo-banner"><Icon name="code" size={15} /><span>{snapshot.mode === "demo" ? "Exploring with sample banking data." : "Using Nessie banking data."} {snapshot.engine === "demo" ? "The demo planner is active. Add an NVIDIA key to use Nemotron." : "Nemotron is connected."}</span></div>}
          {snapshot?.warnings.map(w => <p className="notice" key={w}>{w}</p>)}
          {loading && !snapshot ? <div className="loading-state"><span className="spinner" /><h3>Getting your workspace ready</h3><p>Connecting the pieces of your financial picture.</p></div> : !snapshot ? <div className="panel empty-state"><Icon name="wallet" size={32} /><h3>Let’s connect your banking data.</h3><p>Check the connection settings in your environment file, then try again.</p><button className="primary-button" onClick={() => void refresh()}>Try again</button></div> : <>
            <section className="balance-grid" aria-label="Account overview"><div className="balance-card balance-primary"><span className="balance-label">Across deposit accounts <Icon name="wallet" size={18} /></span><strong>{money(cash)}</strong><div><span className="balance-dot" />Checking + savings balances</div></div>{accounts.slice(0, 2).map((account, i) => <div className="balance-card" key={account._id}><span className="balance-label">{account.type}<span className={`account-icon ${i ? "mint" : "lavender"}`}><Icon name={i ? "wallet" : "card"} size={17} /></span></span><strong>{money(account.balance)}</strong><div>{account.nickname}<span>•• {account._id.slice(-4)}</span></div></div>)}</section>
            {view === "overview" && <>
              <div className="section-heading"><h2>Your dashboard <span>MADE FOR YOU</span></h2><div><button className="text-button" disabled={!history.length || busy} onClick={() => { const previous = history.at(-1); if (previous) { setDashboard(previous); setHistory(h => h.slice(0, -1)); } }}><Icon name="undo" size={15} />Undo</button><button className="text-button" disabled={busy} onClick={() => { commit({ ...structuredClone(initialDashboard), version: dashboard.version + 1 }); setMessages([]); setEvents([]); }}><Icon name="reset" size={14} />Reset</button></div></div>
              <section className="widget-grid" aria-label="Your generated dashboard">{dashboard.widgets.map(widget => <WidgetCard key={widget.id} widget={widget} snapshot={snapshot} remove={() => { if (!busy) commit({ ...dashboard, version: dashboard.version + 1, widgets: dashboard.widgets.filter(w => w.id !== widget.id) }); }} setBudget={amount => { if (!busy) setDashboard(d => ({ ...d, widgets: d.widgets.map(w => w.id === widget.id ? { ...w, budget: amount } : w) })); }} />)}{!dashboard.widgets.length && <div className="panel empty-state"><Icon name="plus" size={30} /><h3>A blank canvas, just for you.</h3><p>Ask Genuis to build your first view.</p></div>}</section>
            </>}
            {view !== "bills" && <section className="panel transaction-panel"><div className="panel-heading"><div><h3>Recent transactions</h3><p>The everyday, at a glance.</p></div><label className="search-field"><Icon name="search" size={15} /><input aria-label="Search transactions" placeholder="Find a transaction" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="table-scroll"><table><thead><tr><th>Merchant</th><th>Category</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{purchases.slice(0, view === "activity" ? 100 : 5).map(p => <tr key={p.id}><td><span className={`merchant-avatar color-${p.merchant.length % 4}`}>{p.merchant.slice(0, 1)}</span><span>{p.merchant}</span></td><td><span className="category-chip">{p.category}</span></td><td>{new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</td><td className="amount">−{money(p.amount)}</td><td><span className={`status-chip ${p.status === "pending" ? "pending" : ""}`}><i />{p.status}</span></td></tr>)}</tbody></table>{!purchases.length && <div className="empty-state"><p>No matching transactions.</p></div>}</div><div className="table-footer"><span>{purchases.length} transactions available</span><button className="text-button" onClick={() => setView(view === "activity" ? "overview" : "activity")}>{view === "activity" ? "Back to overview" : "View all activity"}<Icon name="arrow" size={14} /></button></div></section>}
            {view === "bills" && <section className="panel"><div className="panel-heading"><div><h3>Bills & payments</h3><p>Payment records from your banking workspace.</p></div><Icon name="calendar" /></div>{snapshot.bills.map(b => <div className="bill-row" key={b.id}><span className="merchant-avatar color-2"><Icon name="bill" size={18} /></span><div><strong>{b.payee}</strong><span>{b.date || "No payment date"} · {b.status}</span></div><strong>{money(b.amount)}</strong></div>)}{!snapshot.bills.length && <div className="empty-state"><p>No bills found for this customer.</p></div>}</section>}
            <footer className="main-footer"><span><Icon name="shield" size={13} />A banking sandbox. No real money moves here.</span><span>BUILT WITH NESSIE + NEMOTRON</span></footer>
          </>}
        </main>
        <aside className="assistant-panel" aria-label="Genuis assistant">
          <div className="assistant-heading"><span className="assistant-logo"><Icon name="sparkle" size={19} /></span><div><h2>A little help from Genuis</h2><span><i />{snapshot?.engine === "nemotron" ? "Powered by Nemotron" : "Demo planner · No model connected"}</span></div><span className="beta-label">BETA</span></div>
          <div className="assistant-content"><div className="assistant-welcome"><div className="welcome-art"><span /><Icon name="sparkle" size={33} /><i /></div><h3>What would make<br />this feel more like you?</h3><p>A new perspective. A useful little tool.<br />Tell me what you have in mind.</p></div><div className="suggestion-list">{suggestions.map(s => <button key={s.label} disabled={busy || !snapshot} onClick={() => void submit(s.prompt)}><span><Icon name={s.icon} size={16} />{s.label}</span><Icon name="plus" size={13} /></button>)}</div><div className="conversation" aria-live="polite">{messages.map((m, i) => <div key={i} className={`message message-${m.role}`}>{m.role === "assistant" && <Icon name="sparkle" size={14} />}<p>{m.text}</p></div>)}</div>{events.length > 0 && <div className="agent-events"><div className="events-heading"><Icon name="activity" size={13} />BEHIND THE SCENES</div>{events.slice(-7).map((event, i) => <div className="agent-event" key={i}><span className={event.status === "done" ? "event-done" : "event-working"}>{event.status === "done" ? <Icon name="check" size={11} /> : <i />}</span><p>{event.message}</p></div>)}</div>}<div ref={messageEnd} /></div>
          <div className="assistant-composer"><form onSubmit={e => { e.preventDefault(); void submit(prompt); }}><label className="sr-only" htmlFor="prompt">Describe your dashboard change</label><textarea id="prompt" rows={3} placeholder="Make this space work for me…" value={prompt} maxLength={2000} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(prompt); } }} disabled={busy} /><div className="composer-bottom"><span><Icon name="sparkle" size={12} />Your ideas → your interface</span>{busy ? <button type="button" className="send-button" aria-label="Cancel change" onClick={cancel}><Icon name="close" size={17} /></button> : <button className="send-button" aria-label="Build this change" disabled={!snapshot || prompt.trim().length < 3}><Icon name="up" size={18} /></button>}</div></form><p>Changes stay in your workspace. Undo anytime.</p></div>
        </aside>
      </div>
    </div>
    {pending && custom?.code && <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Checking generated component"><div className="panel preview-panel"><div className="panel-heading"><div><h3>Checking your new component</h3><p>Your current dashboard stays in place until this renders.</p></div><button className="icon-button" onClick={cancel} aria-label="Cancel preview"><Icon name="close" /></button></div><GeneratedWidget code={custom.code} data={executeQuery(pending.snapshot, custom.query)} onReady={() => finish(pending)} onError={message => { setPending(null); setBusy(false); setError(message); }} /></div></div>}
  </div>;
}
