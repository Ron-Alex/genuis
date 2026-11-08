"use client";
import type { BankSnapshot, QueryResult, Widget } from "@/lib/contracts";
import { executeQuery } from "@/lib/query";
import { GeneratedWidget } from "./generated-widget";
import { Icon } from "./icon";
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const colors = ["#8d73df", "#b6a3f0", "#a8d8ca", "#d8e9b0", "#edc79c", "#a6c9ed", "#d8d4df"];
const label = (value: string) => /^\d{4}-\d{2}$/.test(value) ? new Date(`${value}-02T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : value;
function Donut({ data }: { data: QueryResult }) {
  const visible = data.rows.slice(0, 6);
  const rest = data.rows.slice(6).reduce((sum, r) => sum + r.value, 0);
  if (rest) visible.push({ label: "Other", value: rest, count: 0 });
  let position = 0;
  const gradient = visible.map((row, i) => { const start = position; position += data.total ? row.value / data.total * 100 : 0; return `${colors[i]} ${start}% ${position}%`; }).join(",");
  return <div className="donut-layout"><div className="donut" role="img" aria-label={`Spending breakdown, total ${money(data.total)}`} style={{ background: `conic-gradient(${gradient || "#eee 0% 100%"})` }}><div className="donut-hole"><span>Total spending</span><strong>{money(data.total)}</strong><small>{data.count} purchases</small></div></div><div className="legend">{visible.map((row, i) => <div key={row.label}><span><i style={{ background: colors[i] }} />{label(row.label)}</span><strong>{money(row.value)}</strong></div>)}</div></div>;
}
function Bars({ data, accent }: { data: QueryResult; accent: string }) {
  const rows = data.rows.slice(0, 8), max = Math.max(1, ...rows.map(r => r.value));
  return <><div className="chart-topline"><strong>{money(data.total)}</strong><span>{data.count} records</span></div><div className={`bar-chart accent-${accent}`} role="img" aria-label={rows.map(r => `${label(r.label)}: ${money(r.value)}`).join("; ")}><div className="chart-grid"><i /><i /><i /><i /></div>{rows.map(row => <div className="bar-column" key={row.label}><span className="bar-amount">{money(row.value)}</span><div className="bar" style={{ height: `${Math.max(row.value > 0 ? 2 : 0, row.value / max * 140)}px` }} /><span className="bar-label" title={label(row.label)}>{label(row.label)}</span></div>)}</div>{data.rows.length > 8 && <p className="chart-note">Showing the first 8 groups. Total includes all groups.</p>}</>;
}
function Line({ data }: { data: QueryResult }) {
  const rows = data.rows.slice(0, 24), max = Math.max(1, ...rows.map(r => r.value));
  const points = rows.map((r, i) => `${24 + i / Math.max(1, rows.length - 1) * 512},${164 - r.value / max * 132}`);
  return <><div className="chart-topline"><strong>{money(data.total)}</strong><span>{data.count} records</span></div><svg className="line-chart" viewBox="0 0 560 195" role="img" aria-label={rows.map(r => `${label(r.label)}: ${money(r.value)}`).join("; ")}><defs><linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#aa93e6" stopOpacity=".25" /><stop offset="100%" stopColor="#aa93e6" stopOpacity="0" /></linearGradient></defs>{[32, 76, 120, 164].map(y => <line key={y} x1="20" x2="540" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />)}<polygon points={`24,164 ${points.join(" ")} 536,164`} fill="url(#line-fill)" /><polyline points={points.join(" ")} stroke="#9476e4" fill="none" strokeWidth="3" />{rows.map((r, i) => <g key={r.label}><circle cx={24 + i / Math.max(1, rows.length - 1) * 512} cy={164 - r.value / max * 132} r="4" fill="#9476e4"><title>{money(r.value)}</title></circle>{(rows.length < 8 || i % Math.ceil(rows.length / 6) === 0) && <text x={24 + i / Math.max(1, rows.length - 1) * 512} y="189" textAnchor="middle" fontSize="10" fill="currentColor">{label(r.label)}</text>}</g>)}</svg></>;
}
export function WidgetCard({ widget, snapshot, remove, setBudget }: { widget: Widget; snapshot: BankSnapshot; remove: () => void; setBudget: (amount: number) => void }) {
  let data: QueryResult;
  try { data = executeQuery(snapshot, widget.query); } catch { return <article className="panel widget-card"><h3>{widget.title}</h3><p className="inline-error">This widget refers to an unavailable account. Remove or regenerate it.</p><button onClick={remove}>Remove widget</button></article>; }
  return <article className={`panel widget-card ${widget.kind === "custom" ? "custom-card" : ""}`}><div className="panel-heading"><div><h3>{widget.title}</h3><p>{widget.subtitle}</p></div><button className="icon-button widget-remove" aria-label={`Remove ${widget.title}`} title="Remove widget" onClick={remove}><Icon name="close" size={16} /></button></div>
    {widget.kind === "custom" && widget.code ? <GeneratedWidget code={widget.code} data={data} />
      : !data.count ? <div className="empty-widget"><Icon name="search" size={28} /><p>No matching records.</p><span>Try a different category or date range.</span></div>
      : widget.kind === "donut" ? <Donut data={data} />
      : widget.kind === "line" ? <Line data={data} />
      : widget.kind === "table" ? <div className="widget-table"><table><thead><tr><th>{widget.query.groupBy === "none" ? "Record" : "Group"}</th><th>Amount</th></tr></thead><tbody>{data.rows.map((r, i) => <tr key={`${r.label}-${i}`}><td>{label(r.label)}</td><td>{money(r.value)}</td></tr>)}</tbody></table></div>
      : widget.kind === "budget" ? <div className="budget-widget"><div className="chart-topline"><strong>{money(data.total)}</strong><span>of {money(widget.budget || 300)}</span></div><div className="budget-track"><div style={{ width: `${Math.min(100, data.total / (widget.budget || 300) * 100)}%` }} /></div><label>Budget target <input type="number" min="1" max="1000000000" aria-label={`${widget.title} budget target`} value={widget.budget || 300} onChange={e => { const value = Number(e.target.value); if (value > 0 && value <= 1e9) setBudget(value); }} /></label><p>{money(Math.max(0, (widget.budget || 300) - data.total))} remaining · A local tracker, not a bank-enforced limit.</p></div>
      : <Bars data={data} accent={widget.accent} />}
    <div className="widget-footer"><span className="tiny-dot" />{snapshot.mode === "demo" ? "Sample banking data" : "Connected to Nessie"}<span>{widget.kind === "custom" ? "Generated component" : `${data.count} records`}</span></div>
  </article>;
}
