import { readFile } from "node:fs/promises";

const env = await readFile(new URL("../.env", import.meta.url), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}
const customerId = "4f02c702-1424-4b0c-8e13-4b93b3318b82";
const key = process.env.NESSIE_API_KEY;
if (!key) throw new Error("NESSIE_API_KEY missing from genuis/.env");
if (process.env.NESSIE_CUSTOMER_ID !== customerId) throw new Error(`Set NESSIE_CUSTOMER_ID=${customerId} in .env to confirm the target customer.`);
const base = (process.env.NESSIE_BASE_URL || "https://prod-api.nessieisreal.com").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("NESSIE_BASE_URL must use HTTPS.");

async function api(path, method = "GET", body) {
  const url = new URL(base + path); url.searchParams.set("key", key);
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}
const accounts = await api(`/customers/${customerId}/accounts`);
if (!Array.isArray(accounts) || accounts.length < 2) throw new Error("Need at least two customer accounts; nothing created.");
const merchants = await api("/merchants");
if (!Array.isArray(merchants) || !merchants.length) throw new Error("No merchants available; nothing created.");
const primary = accounts[0], secondary = accounts[1];
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const results = { deposits: 0, transfers: 0, withdrawals: 0, purchases: 0, errors: [] };
async function batch(kind, endpoint, make) {
  for (let i = 0; i < 10; i++) {
    const record = make(i);
    try { await api(endpoint(record), "POST", record); results[kind]++; console.log(`[${kind}] ${results[kind]}/10 created`, record); }
    catch (error) { results.errors.push({ kind, index: i + 1, error: error.message }); console.error(`[${kind}] ${i + 1}/10 failed`, error.message); }
  }
}
await batch("deposits", () => `/accounts/${primary._id}/deposits`, i => ({ medium: "balance", transaction_date: day(i + 1), status: "completed", amount: [125, 240, 85, 310, 175, 95, 420, 150, 205, 330][i], description: `Mock data: payroll deposit ${i + 1}` }));
await batch("transfers", () => `/accounts/${primary._id}/transfers`, i => ({ medium: "balance", payee_id: secondary._id, amount: [25, 40, 15, 60, 32, 18, 75, 50, 22, 45][i], transaction_date: day(i + 1), status: "completed", description: `Mock data: transfer ${i + 1}` }));
await batch("withdrawals", () => `/accounts/${primary._id}/withdrawals`, i => ({ medium: "balance", transaction_date: day(i + 1), status: "completed", amount: [20, 35, 15, 50, 28, 12, 42, 18, 31, 25][i], description: `Mock data: ATM withdrawal ${i + 1}` }));
await batch("purchases", i => `/accounts/${primary._id}/purchases`, i => ({ merchant_id: merchants[i % merchants.length]._id, medium: "balance", purchase_date: day(i + 1), amount: [12.5, 28.75, 43.2, 9.99, 65.4, 17.25, 31.8, 22.1, 54.65, 14.35][i], status: "completed", description: `Mock data: purchase ${i + 1}` }));
console.log("Finished transaction seeding", results);
if (results.errors.length) process.exitCode = 1;
