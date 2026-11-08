import type { BankSnapshot } from "./contracts";

export function demoSnapshot(): BankSnapshot {
  const merchants = [
    ["Whole Foods", "Groceries", 76.42], ["Trader Joe's", "Groceries", 48.31],
    ["Sweetgreen", "Restaurants", 16.8], ["CAVA", "Restaurants", 14.65],
    ["Blue Bottle", "Coffee", 6.5], ["Spotify", "Subscriptions", 11.99],
    ["Netflix", "Subscriptions", 15.49], ["Uber", "Transport", 24.2],
    ["Target", "Shopping", 68.25], ["Amazon", "Shopping", 42.8],
    ["Shell", "Transport", 38.75], ["UTD Bookstore", "Education", 54.3],
  ] as const;
  const purchases = [8, 9, 10].flatMap((month, monthIndex) =>
    Array.from({ length: 36 }, (_, i) => {
      const [merchant, category, base] = merchants[i % merchants.length];
      const amount = Math.round(base * (1 + ((i * 7 + monthIndex * 3) % 9) / 15) * 100) / 100;
      return { id: `demo-${month}-${i}`, accountId: i % 4 === 0 ? "demo-credit" : "demo-checking", date: `2026-${String(month).padStart(2, "0")}-${String(1 + (i * 3) % 28).padStart(2, "0")}`, merchant, category, amount, status: "completed" };
    }));
  return {
    mode: "demo", engine: process.env.NVIDIA_API_KEY ? "nemotron" : "demo", customer: "Alex Morgan",
    accounts: [
      { _id: "demo-checking", nickname: "Everyday checking", type: "Checking", balance: 4280.65 },
      { _id: "demo-savings", nickname: "A little more freedom", type: "Savings", balance: 12650 },
      { _id: "demo-credit", nickname: "Everyday card", type: "Credit Card", balance: 847.32 },
    ],
    purchases,
    bills: [
      { id: "rent", accountId: "demo-checking", payee: "November rent", date: "2026-11-10", amount: 1250, status: "pending" },
      { id: "internet", accountId: "demo-checking", payee: "Internet", date: "2026-11-12", amount: 65, status: "pending" },
      { id: "electric", accountId: "demo-checking", payee: "Electricity", date: "2026-11-15", amount: 82.4, status: "pending" },
    ], warnings: [], fetchedAt: new Date().toISOString(),
  };
}
