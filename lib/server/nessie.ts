import { z } from "zod";
import { accountSchema, type BankSnapshot } from "../contracts";
import { demoSnapshot } from "../demo";

export class PublicError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export function configuration() {
  const demo = process.env.NESSIE_DEMO_MODE === "true" || (!process.env.NESSIE_API_KEY && process.env.NESSIE_DEMO_MODE !== "false");
  return { demo, engine: process.env.OPENROUTER_API_KEY ? "nemotron" as const : "demo" as const };
}

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  const key = process.env.NESSIE_API_KEY;
  if (!key) throw new PublicError("Add NESSIE_API_KEY to .env and restart the development server.", 503);
  const url = new URL(`${(process.env.NESSIE_BASE_URL || "https://prod-api.nessieisreal.com").replace(/\/$/, "")}${path}`);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new PublicError("NESSIE_BASE_URL must use HTTPS.", 503);
  url.searchParams.set("key", key);
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
  } catch { throw new PublicError("Nessie could not be reached. Check NESSIE_BASE_URL and your connection."); }
  if (!response.ok) throw new PublicError(`Nessie returned ${response.status}. Check your key, selected customer, and API base URL.`);
  try { return await response.json(); } catch { throw new PublicError("Nessie returned an unreadable response."); }
}

const purchaseSchema = z.object({ _id: z.string(), merchant_id: z.string(), purchase_date: z.string(), amount: z.number(), status: z.string().default("completed") });
const billSchema = z.object({ _id: z.string(), payee: z.string().default("Bill"), nickname: z.string().optional(), payment_date: z.string().optional(), upcoming_payment_date: z.string().optional(), payment_amount: z.number(), status: z.string().default("pending") });
const merchantSchema = z.object({ _id: z.string(), name: z.string(), category: z.union([z.string(), z.array(z.string())]).optional() });

export async function loadBankSnapshot(signal?: AbortSignal): Promise<BankSnapshot> {
  if (configuration().demo) return demoSnapshot();
  const customerId = process.env.NESSIE_CUSTOMER_ID;
  if (!customerId) throw new PublicError("Set NESSIE_CUSTOMER_ID in .env to select the demo banking customer.", 503);
  const raw = await get(`/customers/${encodeURIComponent(customerId)}/accounts`, signal);
  const parsed = z.array(accountSchema).safeParse(raw);
  if (!parsed.success) throw new PublicError("Nessie accounts did not match the expected API response. Verify NESSIE_BASE_URL.");
  const accounts = parsed.data;
  if (accounts.length > 12) throw new PublicError("Select a prototype customer with 12 or fewer accounts.", 422);
  const warnings: string[] = [];
  const purchases: BankSnapshot["purchases"] = [];
  const bills: BankSnapshot["bills"] = [];
  const merchantIds = new Set<string>();
  const accountResults = await Promise.all(accounts.map(async account => {
    const [p, b] = await Promise.all([
      get(`/accounts/${encodeURIComponent(account._id)}/purchases`, signal),
      get(`/accounts/${encodeURIComponent(account._id)}/bills`, signal),
    ]);
    const purchases = z.array(purchaseSchema).safeParse(p);
    const bills = z.array(billSchema).safeParse(b);
    if (!purchases.success || !bills.success) throw new PublicError("A Nessie transaction response has unexpected fields. No incomplete totals were displayed.");
    return { account, purchases: purchases.data, bills: bills.data };
  }));
  for (const result of accountResults) result.purchases.forEach(p => merchantIds.add(p.merchant_id));
  if (merchantIds.size > 100) throw new PublicError("This prototype supports up to 100 merchants per customer.", 422);
  const merchants = new Map<string, z.infer<typeof merchantSchema>>();
  const ids = [...merchantIds];
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async id => {
      const parsed = merchantSchema.safeParse(await get(`/merchants/${encodeURIComponent(id)}`, signal));
      if (!parsed.success) throw new PublicError("A merchant response has unexpected fields.");
      merchants.set(id, parsed.data);
    }));
  }
  for (const result of accountResults) {
    result.purchases.forEach(p => {
      const m = merchants.get(p.merchant_id);
      purchases.push({ id: p._id, accountId: result.account._id, date: p.purchase_date.slice(0, 10), merchant: m?.name || "Unknown merchant", category: (Array.isArray(m?.category) ? m.category[0] : m?.category) || "Uncategorized", amount: p.amount, status: p.status });
    });
    result.bills.forEach(b => bills.push({ id: b._id, accountId: result.account._id, payee: b.nickname || b.payee, date: (b.upcoming_payment_date || b.payment_date || "").slice(0, 10), amount: b.payment_amount, status: b.status }));
  }
  if (purchases.some(p => p.category === "Uncategorized")) warnings.push("Some merchants have no category. They are shown as Uncategorized.");
  return { mode: "nessie", engine: configuration().engine, customer: "Your workspace", accounts, purchases, bills, warnings, fetchedAt: new Date().toISOString() };
}
