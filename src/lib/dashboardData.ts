// Presentation-side aggregation for Home and Reports > Insights.
// Every figure comes from the central accounting engine; nothing is stored.
import { filterByPeriod, portfolio, summarize, commitmentStatement } from "@/lib/accountingEngine";
import { addMonths, fyStart, monthKey, monthShort } from "@/lib/format";
import type { DB, Transaction } from "@/lib/types";

export type HealthStatus = "Healthy" | "Caution" | "Critical";

export function monthsFor(period: string, txs: Transaction[], today: string) {
  if (period.startsWith("FY:")) { const y = Number(period.slice(3)); return Array.from({ length: 12 }, (_, i) => monthKey(addMonths(`${y}-04-01`, i))); }
  if (period.startsWith("M:")) { const end = `${period.slice(2)}-01`; return Array.from({ length: 6 }, (_, i) => monthKey(addMonths(end, i - 5))); }
  if (period.startsWith("L:")) { const n = Number(period.slice(2)); return Array.from({ length: n }, (_, i) => monthKey(addMonths(`${monthKey(today)}-01`, i - n + 1))); }
  const keys = [...new Set(txs.map((t) => monthKey(t.date)))].sort();
  return keys.length ? keys : [monthKey(today)];
}

export function monthSeries(db: DB, months: string[]) {
  return months.map((k) => {
    const m = summarize(db.transactions.filter((t) => monthKey(t.date) === k));
    return { key: k, month: monthShort(k), Income: m.income, Expense: m.expense, Savings: m.savings, "Interest Paid": m.interestPaid + m.emiInterest, "Interest Received": m.interestReceived, Inflow: m.inflow, Outflow: m.outflow };
  });
}

export function computeDashboard(db: DB, period: string, today: string) {
  const pf = portfolio(db, today);
  const txs = filterByPeriod(db.transactions, period);
  const s = summarize(txs);
  const thisMonth = summarize(filterByPeriod(db.transactions, `M:${monthKey(today)}`));
  const series = monthSeries(db, monthsFor(period, db.transactions, today));
  const pie = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  const avgExp = series.length ? series.reduce((a, b) => a + b.Expense, 0) / Math.max(1, series.filter((x) => x.Expense > 0).length) : 0;
  const avgInc = series.length ? series.reduce((a, b) => a + b.Income, 0) / Math.max(1, series.filter((x) => x.Income > 0).length) : 0;
  const discretionary = txs.filter((t) => t.essentialOrDiscretionary === "Discretionary").reduce((a, t) => a + t.amount, 0);
  const grade = (v: number, good: number, warn: number, higherBetter = true): HealthStatus =>
    (higherBetter ? v >= good : v <= good) ? "Healthy" : (higherBetter ? v >= warn : v <= warn) ? "Caution" : "Critical";
  const interestOut = s.interestPaid + s.emiInterest;
  const health = [
    { name: "Savings rate", value: `${s.savingsRate.toFixed(1)}%`, status: grade(s.savingsRate, 20, 10), note: "Target ≥ 20%" },
    { name: "Debt-to-income (FOIR)", value: `${avgInc ? ((pf.monthlyObligations / avgInc) * 100).toFixed(1) : 0}%`, status: grade(avgInc ? (pf.monthlyObligations / avgInc) * 100 : 0, 40, 55, false), note: "Banks prefer ≤ 40%" },
    { name: "Emergency fund", value: `${avgExp ? (pf.cash / avgExp).toFixed(1) : "∞"} months`, status: grade(avgExp ? pf.cash / avgExp : 99, 6, 3), note: "Cash ÷ avg monthly spend" },
    { name: "Interest coverage", value: `${interestOut ? (s.interestReceived / interestOut).toFixed(2) : "—"}×`, status: grade(interestOut ? s.interestReceived / interestOut : 1, 1, 0.5), note: "Interest received ÷ paid" },
    { name: "Overdue receivables", value: pf.overdueReceivables, status: grade(pf.overdueReceivables, 0, 10000, false), note: "Unpaid interest from borrowers" },
    { name: "Overdue payables", value: pf.overduePayables, status: grade(pf.overduePayables, 0, 10000, false), note: "Interest you owe lenders" },
    { name: "Leverage", value: `${pf.totalAssets ? ((pf.totalLiabilities / pf.totalAssets) * 100).toFixed(0) : 0}%`, status: grade(pf.totalAssets ? (pf.totalLiabilities / pf.totalAssets) * 100 : 0, 50, 75, false), note: "Liabilities ÷ assets" },
    { name: "Discretionary spend", value: `${s.expense ? ((discretionary / s.expense) * 100).toFixed(0) : 0}%`, status: grade(s.expense ? (discretionary / s.expense) * 100 : 0, 30, 45, false), note: "Share of tagged wants" },
  ];
  const score = Math.round(health.reduce((n, h) => n + (h.status === "Healthy" ? 100 : h.status === "Caution" ? 50 : 0), 0) / health.length);
  return { pf, s, txs, thisMonth, series, pie, health, score };
}

/** Net worth change this month = net cash/asset effect of this month's flows, from the engine's own summary. */
export function upcomingDues(db: DB, today: string, days = 30) {
  return commitmentStatement(db, today, days);
}

export const fyPeriod = (today: string) => `FY:${fyStart(today)}`;

/** Stable colour per category: index in master config, then first-seen order. */
export function categoryColorMap(db: DB, names: string[]) {
  const order = [...Object.keys(db.config.expenseCategories), ...db.config.incomeCategories];
  const map: Record<string, string> = {};
  const used = new Set<number>();
  for (const n of names) {
    let i = order.indexOf(n);
    i = i >= 0 ? i % 7 : -1;
    if (i < 0 || used.has(i)) { i = [0, 1, 2, 3, 4, 5, 6].find((x) => !used.has(x)) ?? 7; }
    used.add(i);
    map[n] = `var(--cat-${i + 1})`;
  }
  map["Other"] = "var(--cat-8)";
  return map;
}
