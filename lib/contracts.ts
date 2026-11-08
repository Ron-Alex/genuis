import { z } from "zod";

export const querySchema = z.object({
  source: z.enum(["purchases", "bills", "accounts"]).default("purchases"),
  groupBy: z.enum(["category", "merchant", "month", "day", "account", "none"]).default("category"),
  category: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  accountId: z.string().max(100).optional(),
}).refine(q => !q.from || !q.to || q.from <= q.to, "Start date must precede end date");
export type DataQuery = z.infer<typeof querySchema>;

export const planSchema = z.object({
  operation: z.enum(["add", "update", "remove", "theme", "clarify"]),
  title: z.string().min(1).max(100),
  explanation: z.string().min(1).max(600),
  kind: z.enum(["bar", "line", "donut", "table", "budget", "custom"]).default("bar"),
  targetId: z.string().max(100).optional(),
  theme: z.enum(["light", "dark", "contrast"]).optional(),
  largeText: z.boolean().optional(),
  budget: z.number().positive().max(1e9).optional(),
  question: z.string().max(500).optional(),
});
export type ChangePlan = z.infer<typeof planSchema>;

export const accountSchema = z.object({
  _id: z.string(), nickname: z.string().default("Account"),
  type: z.string(), balance: z.number(), customer_id: z.string().optional(),
});
export type Account = z.infer<typeof accountSchema>;
export type Transaction = { id: string; accountId: string; date: string; merchant: string; category: string; amount: number; status: string };
export type Bill = { id: string; accountId: string; payee: string; date: string; amount: number; status: string };
export type BankSnapshot = {
  mode: "demo" | "nessie"; engine: "demo" | "nemotron"; customer: string;
  accounts: Account[]; purchases: Transaction[]; bills: Bill[]; warnings: string[];
  fetchedAt: string;
};
export type QueryResult = {
  rows: { label: string; value: number; count: number }[];
  total: number; count: number; query: DataQuery; description: string;
};

export const widgetSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(300).default(""),
  kind: z.enum(["bar", "line", "donut", "table", "budget", "custom"]),
  query: querySchema,
  accent: z.enum(["purple", "mint", "blue", "orange"]).default("purple"),
  budget: z.number().positive().max(1e9).optional(),
  code: z.string().max(18000).optional(),
});
export type Widget = z.infer<typeof widgetSchema>;
export const dashboardSchema = z.object({
  version: z.number().int().nonnegative(),
  theme: z.enum(["light", "dark", "contrast"]), largeText: z.boolean(),
  widgets: z.array(widgetSchema).max(12),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export const runRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  dashboard: dashboardSchema,
});
export type RunEvent = {
  stage: "planner" | "data" | "builder" | "validation" | "complete" | "error";
  message: string; status: "running" | "done" | "error";
};
export type RunResult = { dashboard: Dashboard; message: string; engine: "demo" | "nemotron"; mode: "demo" | "nessie" };

export const initialDashboard: Dashboard = {
  version: 0, theme: "light", largeText: false,
  widgets: [
    { id: "spending", title: "Where your money goes", subtitle: "Purchases by category", kind: "donut", query: { source: "purchases", groupBy: "category" }, accent: "purple" },
    { id: "monthly", title: "The bigger picture", subtitle: "Your monthly spending", kind: "bar", query: { source: "purchases", groupBy: "month" }, accent: "mint" },
  ],
};
