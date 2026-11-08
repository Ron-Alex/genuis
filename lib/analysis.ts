import { createHash } from "node:crypto";
import { analysisSchema, type BankSnapshot, type DataQuery, type Evidence, type Metric, type QueryResult, type WidgetAnalysis } from "./contracts";

const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.entries(v as Record<string,unknown>).filter(([k])=>k!=="fetchedAt").sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}` : JSON.stringify(v);
export function snapshotFingerprint(snapshot: BankSnapshot) { return createHash("sha256").update(stable({accounts:snapshot.accounts,purchases:snapshot.purchases,bills:snapshot.bills,warnings:snapshot.warnings})).digest("hex"); }
export function queryFingerprint(query: DataQuery, budget?: number) { return createHash("sha256").update(stable({query,budget})).digest("hex"); }
export function cents(value: number) { return Math.round(value * 100); }
export function periodMetric(current: QueryResult, previous: QueryResult, ids: string[]): Metric {
 const a=cents(current.total), b=cents(previous.total), diff=a-b;
 return {id:"period-change",type:"period_comparison",evidenceIds:ids,values:{currentCents:a,previousCents:b,changeCents:diff,...(b!==0?{changePercent:Math.round(diff/b*10000)/100}: {})},units:"USD",periods:[previous.query.from||"",previous.query.to||"",current.query.from||"",current.query.to||""],filters:current.query};
}
export function contributionMetrics(current: QueryResult, previous: QueryResult, ids: string[]): Metric[] {
 const old=new Map(previous.rows.map(r=>[r.label,cents(r.value)])); const total=cents(current.total)-cents(previous.total);
 return current.rows.map(r=>{const change=cents(r.value)-(old.get(r.label)||0); return {id:`category:${r.label}`,type:"category_contribution" as const,evidenceIds:ids,values:{changeCents:change,...(Math.abs(total)>=100?{contributionPercent:Math.round(change/total*10000)/100}:{})},units:"USD" as const,periods:[previous.query.from||"",previous.query.to||"",current.query.from||"",current.query.to||""],filters:current.query};});
}
export function formatMetric(metric: Metric) {
 const dollars=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
 if(metric.type==="period_comparison"){const diff=metric.values.changeCents||0;return `${dollars(Math.abs(diff))} ${diff<0?"less":"more"} than the comparison period${metric.values.changePercent===undefined?"":` (${Math.abs(metric.values.changePercent)}%)`}.`;}
 return "";
}
export function attachAnalysis(input: Omit<WidgetAnalysis,"id"|"createdAt"|"snapshotFingerprint"|"queryFingerprint">, snapshot: BankSnapshot, query: DataQuery, budget?: number): WidgetAnalysis {
 return analysisSchema.parse({...input,id:crypto.randomUUID(),createdAt:new Date().toISOString(),snapshotFingerprint:snapshotFingerprint(snapshot),queryFingerprint:queryFingerprint(query,budget),budgetTarget:budget});
}
export function analysisIsFresh(analysis: WidgetAnalysis|undefined,snapshot:BankSnapshot,query:DataQuery,budget?:number){return Boolean(analysis&&analysis.status!=="stale"&&analysis.snapshotFingerprint===snapshotFingerprint(snapshot)&&analysis.queryFingerprint===queryFingerprint(query,budget));}
export function makeEvidence(id:string,query:DataQuery,result:QueryResult,snapshot:BankSnapshot):Evidence{return {id,query,result,snapshotFingerprint:snapshotFingerprint(snapshot),fetchedAt:snapshot.fetchedAt,executedAt:new Date().toISOString(),coverage:[...snapshot.warnings,`Available records: ${result.count}.`].slice(0,10)};}
