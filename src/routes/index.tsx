import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useDB } from "@/lib/store";
import { filterByPeriod, portfolio, summarize } from "@/lib/accountingEngine";
import { addMonths, fyLabel, fyStart, inr, inrCompact, monthKey, monthLabel, monthShort, todayISO } from "@/lib/format";
import { Badge, PageHeader, Panel, Select, Stat } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Wallet, Landmark, HandCoins, TrendingUp, ShieldCheck, ChevronRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Khata ERP" },
      { name: "description", content: "Income, expenses, borrowings, lending, EMIs and net worth at a glance in ₹." },
      { property: "og:title", content: "Dashboard — Khata ERP" },
      { property: "og:description", content: "Executive finance dashboard for Indian households and private lenders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "var(--muted-foreground)" }, formatter: (v: number) => `${inr(v)} · ${chartMoney(v)}` };
const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false, minTickGap: 20 };

function monthsFor(period: string, txs: Transaction[], today: string) {
  if (period.startsWith("FY:")) { const y = Number(period.slice(3)); return Array.from({ length: 12 }, (_, i) => monthKey(addMonths(`${y}-04-01`, i))); }
  if (period.startsWith("M:")) { const end = `${period.slice(2)}-01`; return Array.from({ length: 6 }, (_, i) => monthKey(addMonths(end, i - 5))); }
  const keys = [...new Set(txs.map((t) => monthKey(t.date)))].sort();
  return keys.length ? keys : [monthKey(today)];
}

function Dashboard() {
  const db = useDB();
  const today = todayISO();
  const [tab, setTab] = useState("Overview");
  const [full, setFull] = useState(false);
  const [activeChart, setActiveChart] = useState(0);
  const [period, setPeriod] = useState(`FY:${fyStart(today)}`);

  const opts = useMemo(() => {
    const months = [...new Set([monthKey(today), ...db.transactions.map((t) => monthKey(t.date))])].sort().reverse();
    const fys = [...new Set([fyStart(today), ...db.transactions.map((t) => fyStart(t.date))])].sort().reverse();
    return { months, fys };
  }, [db.transactions, today]);

  const pf = useMemo(() => portfolio(db, today), [db, today]);
  const txs = useMemo(() => filterByPeriod(db.transactions, period), [db.transactions, period]);
  const s = useMemo(() => summarize(txs), [txs]);
  const thisMonth = useMemo(() => summarize(filterByPeriod(db.transactions, `M:${monthKey(today)}`)), [db.transactions, today]);

  const months = monthsFor(period, db.transactions, today);
  const series = months.map((k) => {
    const m = summarize(db.transactions.filter((t) => monthKey(t.date) === k));
    return { month: monthShort(k), Income: m.income, Expense: m.expense, Savings: m.savings, "Interest Paid": m.interestPaid + m.emiInterest, "Interest Received": m.interestReceived, Inflow: m.inflow, Outflow: m.outflow };
  });
  const pie = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const byLender = pf.borrowings.map((x) => ({ name: x.loan.counterparty, value: x.s.outstanding })).concat(pf.emis.map((x) => ({ name: `${x.loan.lender} EMI`, value: x.s.outstanding })));
  const byBorrower = pf.lendings.map((x) => ({ name: x.loan.counterparty, value: x.s.outstanding }));
  const emi12 = Array.from({ length: 12 }, (_, i) => {
    const k = monthKey(addMonths(today, i, 1));
    return { month: monthShort(k), EMI: pf.emis.reduce((sum, e) => sum + e.s.rows.filter((r) => monthKey(r.dueDate) === k).reduce((a, r) => a + r.emi, 0), 0) };
  });
  const debtProgress = [
    ...pf.borrowings.map((x) => ({ name: x.loan.loanId, total: x.s.original + x.s.additional, repaid: x.s.repaid })),
    ...pf.emis.map((x) => ({ name: x.loan.loanId, total: x.loan.originalAmount, repaid: x.loan.originalAmount - x.s.outstanding })),
  ].map((d) => ({ name: d.name, "Repaid %": d.total ? Math.round((d.repaid / d.total) * 100) : 0 }));

  // 8 health indicators
  const avgExp = series.length ? series.reduce((a, b) => a + b.Expense, 0) / Math.max(1, series.filter((x) => x.Expense > 0).length) : 0;
  const avgInc = series.length ? series.reduce((a, b) => a + b.Income, 0) / Math.max(1, series.filter((x) => x.Income > 0).length) : 0;
  const discretionary = txs.filter((t) => t.essentialOrDiscretionary === "Discretionary").reduce((a, t) => a + t.amount, 0);
  const grade = (v: number, good: number, warn: number, higherBetter = true) =>
    (higherBetter ? v >= good : v <= good) ? "Healthy" : (higherBetter ? v >= warn : v <= warn) ? "Caution" : "Critical";
  const health = [
    { name: "Savings rate", value: `${s.savingsRate.toFixed(1)}%`, status: grade(s.savingsRate, 20, 10), note: "Target ≥ 20%" },
    { name: "Debt-to-income (FOIR)", value: `${avgInc ? ((pf.monthlyObligations / avgInc) * 100).toFixed(1) : 0}%`, status: grade(avgInc ? (pf.monthlyObligations / avgInc) * 100 : 0, 40, 55, false), note: "Banks prefer ≤ 40%" },
    { name: "Emergency fund", value: `${avgExp ? (pf.cash / avgExp).toFixed(1) : "∞"} months`, status: grade(avgExp ? pf.cash / avgExp : 99, 6, 3), note: "Cash ÷ avg monthly spend" },
    { name: "Interest coverage", value: `${s.interestPaid + s.emiInterest ? (s.interestReceived / (s.interestPaid + s.emiInterest)).toFixed(2) : "—"}×`, status: grade(s.interestPaid + s.emiInterest ? s.interestReceived / (s.interestPaid + s.emiInterest) : 1, 1, 0.5), note: "Interest received ÷ paid" },
    { name: "Overdue receivables", value: inr(pf.overdueReceivables), status: grade(pf.overdueReceivables, 0, 10000, false), note: "Unpaid interest from borrowers" },
    { name: "Overdue payables", value: inr(pf.overduePayables), status: grade(pf.overduePayables, 0, 10000, false), note: "Interest you owe lenders" },
    { name: "Leverage", value: `${pf.totalAssets ? ((pf.totalLiabilities / pf.totalAssets) * 100).toFixed(0) : 0}%`, status: grade(pf.totalAssets ? (pf.totalLiabilities / pf.totalAssets) * 100 : 0, 50, 75, false), note: "Liabilities ÷ assets" },
    { name: "Discretionary spend", value: `${s.expense ? ((discretionary / s.expense) * 100).toFixed(0) : 0}%`, status: grade(s.expense ? (discretionary / s.expense) * 100 : 0, 30, 45, false), note: "Share of tagged wants" },
  ];

  const plabel = period === "ALL" ? "All time" : period.startsWith("M:") ? monthLabel(period.slice(2)) : fyLabel(Number(period.slice(3)));
  const cards = [
    { label: "Total income", value: inr(s.income), hint: plabel, tone: "good" as const },
    { label: "Total expenses", value: inr(s.expense), hint: "Incl. interest, excl. principal", tone: "bad" as const },
    { label: "Savings", value: inr(s.savings), hint: plabel, tone: s.savings >= 0 ? ("good" as const) : ("bad" as const) },
    { label: "Savings rate", value: `${s.savingsRate.toFixed(1)}%`, hint: plabel },
    { label: "Outstanding borrowings", value: inr(pf.borrowOut + pf.emiOut), hint: `Private ${inrCompact(pf.borrowOut)} · EMI ${inrCompact(pf.emiOut)}` },
    { label: "Principal lent out", value: inr(pf.lentOut), hint: `${pf.lendings.filter((x) => x.s.outstanding > 0).length} active borrowers` },
    { label: "Interest paid (month)", value: inr(thisMonth.interestPaid + thisMonth.emiInterest), hint: monthLabel(monthKey(today)), tone: "bad" as const },
    { label: "Interest received (month)", value: inr(thisMonth.interestReceived), hint: "Realised only", tone: "good" as const },
    { label: "EMI payments (month)", value: inr(thisMonth.emiPaid), hint: `Principal ${inrCompact(thisMonth.emiPrincipal)}` },
    { label: "Monthly debt obligations", value: inr(pf.monthlyObligations), hint: "EMIs + interest due" },
    { label: "Cash & bank", value: inr(pf.cash), hint: `${db.accounts.length} accounts`, tone: "brand" as const },
    { label: "Net worth", value: inr(pf.netWorth), hint: `Assets ${inrCompact(pf.totalAssets)}`, tone: "brand" as const },
    { label: "Overdue receivables", value: inr(pf.overdueReceivables), tone: pf.overdueReceivables ? ("warn" as const) : ("default" as const) },
    { label: "Overdue payables", value: inr(pf.overduePayables), tone: pf.overduePayables ? ("bad" as const) : ("default" as const) },
    { label: "Upcoming EMIs (30d)", value: inr(pf.upcomingEmiAmount), hint: `${pf.upcomingEmis.length} instalment(s)` },
    { label: "Net interest cash flow", value: inr(s.interestReceived - s.interestPaid - s.emiInterest), hint: plabel, tone: s.interestReceived - s.interestPaid - s.emiInterest >= 0 ? ("good" as const) : ("bad" as const) },
  ];

  return (
    <div>
      <PageHeader
        title="Executive dashboard"
        subtitle={`${plabel} · as of ${today.split("-").reverse().join("-")}`}
        actions={
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48 md:mr-8">
            <option value="ALL">All time</option>
            <optgroup label="Financial year">{opts.fys.map((y) => <option key={y} value={`FY:${y}`}>{fyLabel(y)}</option>)}</optgroup>
            <optgroup label="Month">{opts.months.map((m) => <option key={m} value={`M:${m}`}>{monthLabel(m)}</option>)}</optgroup>
          </Select>
        }
      />

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div role="tablist" aria-label="Dashboard views" className="dashboard-tabs flex min-w-0 gap-1 overflow-x-auto rounded-full border bg-surface p-1">
          {["Overview", "Debt & Lending", "Analytics", "Health Score"].map((name) => <Button key={name} role="tab" aria-selected={tab === name} variant="ghost" size="sm" onClick={() => setTab(name)} className={cn("shrink-0 rounded-full px-4", tab === name ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "text-muted-foreground")}>{name}{name === "Analytics" && <span className="tab-count">10</span>}{name === "Health Score" && <span className="tab-count">8</span>}</Button>)}
        </div>
        <div className="hidden items-center rounded-full border p-1 md:flex">{[false, true].map((v) => <Button key={String(v)} size="sm" variant="ghost" aria-pressed={full === v} onClick={() => setFull(v)} className={cn("rounded-full text-xs", full === v && "bg-muted")}>{v ? "Full view" : "Compact"}</Button>)}</div>
      </div>

      <div className="dashboard-content" data-full={full}>
      {(tab === "Overview" || full) && <>
        <section className="wealth-banner relative mb-5 overflow-hidden rounded-lg border p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-medium text-wealth-muted"><Wallet className="size-4" /> TOTAL NET WORTH</span><span className="text-xs text-wealth-muted">{plabel}</span></div>
          <div className="num mt-3 whitespace-nowrap text-3xl font-semibold sm:text-5xl">{inr(pf.netWorth)}</div>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-wealth-muted/20 bg-wealth-muted/10 px-2.5 py-1 text-[10px] text-wealth-muted"><Activity className="size-3" /> Net interest cash flow <span className="num text-wealth-foreground">{inr(s.interestReceived - s.interestPaid - s.emiInterest)}</span></span>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-wealth-muted/20 pt-4">{[["Cash & bank", pf.cash], ["Total assets", pf.totalAssets], ["Total liabilities", pf.totalLiabilities]].map(([label, value]) => <div key={label} className="min-w-0"><div className="text-[10px] text-wealth-muted sm:text-xs">{label}</div><div className="num mt-1 whitespace-nowrap text-xs font-medium sm:text-lg">{inr(Number(value))}</div></div>)}</div>
        </section>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3, 5, 9].map((i) => <Metric key={cards[i].label} {...cards[i]} index={i} />)}</div>
        <div className="mb-6 flex gap-3 overflow-x-auto pb-1" aria-label="Urgent financial alerts">{[12, 13, 14].map((i) => <a key={i} href="/loans" className={cn("alert-item flex min-w-[210px] flex-1 items-center gap-3 rounded-lg border p-3", i === 14 ? "border-warning/25 bg-warning/5" : "border-destructive/20 bg-destructive/5")}><span className={cn("grid size-8 shrink-0 place-items-center rounded-full", i === 14 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive")}><Activity className="size-4" /></span><div className="min-w-0"><div className="text-[10px] text-muted-foreground">{cards[i].label}</div><div className="num whitespace-nowrap text-sm font-semibold">{cards[i].value}</div></div><ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" /></a>)}</div>
      </>}
      {(tab === "Debt & Lending" || full) && <><div className="mb-3 mt-6 flex items-center gap-2"><HandCoins className="size-4 text-info" /><h2 className="text-sm font-semibold">Debt & lending</h2></div><div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[4, 5, 6, 7, 8, 9, 14, 15].map((i) => <Metric key={i} {...cards[i]} index={i} />)}</div></>}
      {(tab === "Health Score" || full) && <><div className="mb-4 mt-6 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><h2 className="text-sm font-semibold">Financial health</h2><span className="ml-auto text-xs text-muted-foreground">{health.filter((h) => h.status === "Healthy").length} / 8 healthy</span></div><div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{health.map((h) => <div key={h.name} className="panel min-w-0 p-3 sm:p-4"><div className="text-[11px] text-muted-foreground">{h.name}</div><div className="num my-2 whitespace-nowrap text-base font-semibold">{h.value}</div><div className="mb-3 h-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", h.status === "Healthy" ? "w-full bg-success" : h.status === "Caution" ? "w-2/3 bg-warning" : "w-1/3 bg-destructive")} /></div><Badge>{h.status}</Badge><p className="mt-2 text-[10px] text-muted-foreground">{h.note}</p></div>)}</div></>}
      {(tab === "Analytics" || full) && <div className="mb-4 mt-6"><h2 className="text-sm font-semibold">Analytics <span className="font-normal text-muted-foreground">/ 10 charts</span></h2>{!full && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{CHART_NAMES.map((n, i) => <Button key={n} variant={i === activeChart ? "secondary" : "ghost"} size="sm" onClick={() => setActiveChart(i)} className="shrink-0"><span className="text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{n}</Button>)}</div>}</div>}
      <div className={cn("chart-gallery grid gap-4 lg:grid-cols-2", tab === "Health Score" && !full && "hidden")} data-tab={tab} data-chart={activeChart}>
        <Chart title="Income vs expense">
          <BarChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Income" fill={C[0]} radius={[6, 6, 0, 0]} /><Bar dataKey="Expense" fill={C[1]} radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Savings trend">
          <LineChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Line dataKey="Savings" stroke={C[0]} strokeWidth={2.5} dot={false} /></LineChart>
        </Chart>
        <Chart title={`Expense by category · ${plabel}`}>
          <PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">{pie.map((_, i) => <Cell key={i} fill={C[i % 5]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </Chart>
        <Chart title="Borrowings by lender (outstanding)">
          <BarChart data={byLender} layout="vertical"><XAxis type="number" {...axis} tickFormatter={chartMoney} /><YAxis type="category" dataKey="name" {...axis} width={110} /><Tooltip {...tip} /><Bar dataKey="value" name="Outstanding" fill={C[1]} radius={[0, 4, 4, 0]} /></BarChart>
        </Chart>
        <Chart title="Lending by borrower (outstanding)">
          <BarChart data={byBorrower} layout="vertical"><XAxis type="number" {...axis} tickFormatter={chartMoney} /><YAxis type="category" dataKey="name" {...axis} width={110} /><Tooltip {...tip} /><Bar dataKey="value" name="Outstanding" fill={C[2]} radius={[0, 4, 4, 0]} /></BarChart>
        </Chart>
        <Chart title="Interest paid vs received">
          <BarChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Interest Paid" fill={C[1]} radius={[6, 6, 0, 0]} /><Bar dataKey="Interest Received" fill={C[0]} radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="EMI commitments · next 12 months">
          <BarChart data={emi12}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Bar dataKey="EMI" fill={C[3]} radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Cash inflow vs outflow">
          <AreaChart data={series}><defs><linearGradient id="cash-inflow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C[0]} stopOpacity={0.35} /><stop offset="100%" stopColor={C[0]} stopOpacity={0.02} /></linearGradient><linearGradient id="cash-outflow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C[1]} stopOpacity={0.25} /><stop offset="100%" stopColor={C[1]} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Area dataKey="Inflow" stroke={C[0]} fill="url(#cash-inflow)" /><Area dataKey="Outflow" stroke={C[1]} fill="url(#cash-outflow)" /></AreaChart>
        </Chart>
        <Chart title="Assets vs liabilities">
          <BarChart data={[
            { name: "Cash & bank", Assets: pf.cash }, { name: "Receivables", Assets: pf.lentOut }, { name: "Investments", Assets: pf.invested + pf.otherAssets },
            { name: "Private loans", Liabilities: pf.borrowOut }, { name: "EMI loans", Liabilities: pf.emiOut },
          ]}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={chartMoney} width={60} /><Tooltip {...tip} /><Bar dataKey="Assets" stackId="a" fill={C[0]} radius={[6, 6, 0, 0]} /><Bar dataKey="Liabilities" stackId="a" fill={C[1]} radius={[6, 6, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Debt repayment progress">
          <BarChart data={debtProgress} layout="vertical"><XAxis type="number" domain={[0, 100]} {...axis} unit="%" /><YAxis type="category" dataKey="name" {...axis} width={80} /><Tooltip {...tip} formatter={(v: number) => `${v}%`} /><Bar dataKey="Repaid %" fill={C[2]} radius={[0, 4, 4, 0]} background={{ fill: "var(--muted)", radius: 4 }} /></BarChart>
        </Chart>
      </div>
      </div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Panel className="chart-panel"><div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] text-muted-foreground">{title.includes("outstanding") ? "Current principal balance" : title.includes("progress") ? "Principal repaid · %" : "Indian rupees · ₹"}</p></div><Activity className="size-4 text-muted-foreground" /></div>
      <div className="h-60 min-w-0 sm:h-64"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </Panel>
  );
}

const CHART_NAMES = ["Income & expense", "Savings", "Categories", "Lenders", "Borrowers", "Interest", "EMI outlook", "Cash flow", "Assets & liabilities", "Debt progress"];
function chartMoney(v: number) { const a = Math.abs(v); const sign = v < 0 ? "−" : ""; return `${sign}₹${a >= 1e7 ? `${+(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${+(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${+(a / 1e3).toFixed(1)}k` : Math.round(a)}`; }
function Metric({ label, value, hint, index }: { label: string; value: string; hint?: string; index: number; tone?: string }) {
  const Icon = [0, 2, 7].includes(index) ? ArrowDownLeft : [1, 6, 13].includes(index) ? ArrowUpRight : [4, 9].includes(index) ? Landmark : [5, 15].includes(index) ? HandCoins : TrendingUp;
  const tone = [0, 2, 7].includes(index) ? "metric-good" : [1, 6, 13].includes(index) ? "metric-bad" : [8, 9, 14].includes(index) ? "metric-warn" : [5, 15].includes(index) ? "metric-info" : "metric-neutral";
  return <div className={cn("panel metric min-w-0 p-3.5 sm:p-4", tone)}><div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="text-[11px] font-medium text-muted-foreground">{label}</div><Icon className="metric-icon size-4 shrink-0" /></div><div className="num whitespace-nowrap text-lg font-semibold sm:text-xl">{value}</div>{hint && <div title={hint} className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</div>}</div>;
}
