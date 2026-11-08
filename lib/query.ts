import type { BankSnapshot, DataQuery, QueryResult } from "./contracts";

export function executeQuery(snapshot: BankSnapshot, query: DataQuery): QueryResult {
  if (query.accountId && !snapshot.accounts.some(a => a._id === query.accountId)) throw new Error("This account is not part of the selected customer.");
  const items = query.source === "accounts"
    ? snapshot.accounts.map(a => ({ accountId: a._id, date: "", merchant: a.nickname, category: a.type, amount: a.balance }))
    : query.source === "bills"
      ? snapshot.bills.map(b => ({ accountId: b.accountId, date: b.date, merchant: b.payee, category: "Bills", amount: b.amount }))
      : snapshot.purchases.filter(p => p.status !== "cancelled" && p.status !== "pending");
  const filtered = items.filter(item =>
    (!query.accountId || item.accountId === query.accountId) &&
    (!query.category || item.category.toLowerCase() === query.category.toLowerCase()) &&
    (!query.search || `${item.merchant} ${item.category}`.toLowerCase().includes(query.search.toLowerCase())) &&
    (!query.from || item.date >= query.from) && (!query.to || item.date <= query.to));
  const grouped = new Map<string, { cents: number; count: number }>();
  filtered.forEach((item, index) => {
    const label = query.groupBy === "month" ? item.date.slice(0, 7) || "Undated"
      : query.groupBy === "day" ? item.date || "Undated"
      : query.groupBy === "category" ? item.category
      : query.groupBy === "account" ? snapshot.accounts.find(a => a._id === item.accountId)?.nickname || "Account"
      : query.groupBy === "none" ? `${item.merchant} · ${item.date || index + 1}` : item.merchant;
    const current = grouped.get(label) || { cents: 0, count: 0 };
    current.cents += Math.round(item.amount * 100); current.count++;
    grouped.set(label, current);
  });
  const rows = [...grouped].map(([label, value]) => ({ label, value: value.cents / 100, count: value.count }));
  rows.sort(query.groupBy === "month" || query.groupBy === "day" ? (a, b) => a.label.localeCompare(b.label) : (a, b) => b.value - a.value);
  return {
    rows, total: rows.reduce((sum, r) => sum + Math.round(r.value * 100), 0) / 100,
    count: filtered.length, query,
    description: `${filtered.length} ${query.source}${query.from ? ` from ${query.from}` : ""}${query.to ? ` through ${query.to}` : ""}${query.category ? ` · ${query.category}` : ""}`,
  };
}
