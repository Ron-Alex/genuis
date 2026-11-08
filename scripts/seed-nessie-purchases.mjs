import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => {
  throw new Error("Missing genuis/.env. Copy .env.example to .env and set NESSIE_API_KEY.");
});
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match || process.env[match[1]] !== undefined) continue;
  process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
}

const customerId = "4f02c702-1424-4b0c-8e13-4b93b3318b82";
const apiKey = process.env.NESSIE_API_KEY;
if (!apiKey) throw new Error("NESSIE_API_KEY is missing from genuis/.env.");
if (process.env.NESSIE_CUSTOMER_ID && process.env.NESSIE_CUSTOMER_ID !== customerId) {
  throw new Error(`Refusing to write: .env NESSIE_CUSTOMER_ID is not the requested customer (${customerId}).`);
}
const base = (process.env.NESSIE_BASE_URL || "https://prod-api.nessieisreal.com").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("NESSIE_BASE_URL must use HTTPS.");

async function request(path, options = {}) {
  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${body.slice(0, 400)}`);
  try { return body ? JSON.parse(body) : null; } catch { return body; }
}

const accounts = await request(`/customers/${encodeURIComponent(customerId)}/accounts`);
if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("Customer has no accounts; no purchases were created.");
const account = accounts[0];
const merchants = await request("/merchants");
if (!Array.isArray(merchants) || merchants.length === 0) throw new Error("No existing merchants found; no purchases were created.");

const samples = [
  { amount: 18.47, description: "Mock data: coffee and breakfast", daysAgo: 2 },
  { amount: 62.13, description: "Mock data: household supplies", daysAgo: 5 },
  { amount: 34.9, description: "Mock data: lunch", daysAgo: 8 },
  { amount: 91.25, description: "Mock data: groceries", daysAgo: 12 },
  { amount: 14.6, description: "Mock data: transit", daysAgo: 16 },
];
console.log(`Customer: ${customerId}; account: ${account._id}; creating ${samples.length} mock purchases.`);
for (const [index, sample] of samples.entries()) {
  const merchant = merchants[index % merchants.length];
  const date = new Date();
  date.setDate(date.getDate() - sample.daysAgo);
  const purchase = {
    merchant_id: merchant._id,
    medium: "balance",
    purchase_date: date.toISOString().slice(0, 10),
    amount: sample.amount,
    status: "completed",
    description: sample.description,
  };
  await request(`/accounts/${encodeURIComponent(account._id)}/purchases`, { method: "POST", body: JSON.stringify(purchase) });
  console.log(`Created ${index + 1}/${samples.length}: $${sample.amount.toFixed(2)} at ${merchant.name || merchant._id} (${purchase.purchase_date})`);
}
console.log("Mock purchases created.");
