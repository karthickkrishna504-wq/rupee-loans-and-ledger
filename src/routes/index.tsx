import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useDB } from "@/lib/store";
import { filterByPeriod, portfolio, summarize } from "@/lib/accountingEngine";
import { addMonths, fyLabel, fyStart, inr, inrCompact, monthKey, monthLabel, monthShort, todayISO } from "@/lib/format";
import { Badge, PageHeader, Panel, Select, Stat } from "@/components/fin/ui";
import type { Transaction } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Khata ERP" },
      { name: "description", content: "Income, expenses, borrowings, lending, EMIs and net worth at a glance in ₹." },
      { property: "og:title", content: "Dashboard — Khata ERP" },
      { property: "og:description", content: "Executive finance dashboard for Indian households and private lenders." },
    ],
  }),
  component: Dashboard,
});

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }, labelStyle: { color: "var(--muted-foreground)" }, formatter: (v: number) => inr(v) };
const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };

function monthsFor(period: string, txs: Transaction[], today: string) {
  if (period.startsWith("FY:")) { const y = Number(period.slice(3)); return Array.from({ length: 12 }, (_, i) => monthKey(addMonths(`${y}-04-01`, i))); }
  if (period.startsWith("M:")) { const end = `${period.slice(2)}-01`; return Array.from({ length: 6 }, (_, i) => monthKey(addMonths(end, i - 5))); }
  const keys = [...new Set(txs.map((t) => monthKey(t.date)))].sort();
  return keys.length ? keys : [monthKey(today)];
}

function Dashboard() {
  const db = useDB();
  const today = todayISO();
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
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48">
            <option value="ALL">All time</option>
            <optgroup label="Financial year">{opts.fys.map((y) => <option key={y} value={`FY:${y}`}>{fyLabel(y)}</option>)}</optgroup>
            <optgroup label="Month">{opts.months.map((m) => <option key={m} value={`M:${m}`}>{monthLabel(m)}</option>)}</optgroup>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => <Stat key={c.label} {...c} />)}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">Financial health</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {health.map((h) => (
          <div key={h.name} className="panel flex items-start justify-between gap-2 p-3.5">
            <div>
              <div className="text-xs text-muted-foreground">{h.name}</div>
              <div className="num mt-1 font-semibold">{h.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{h.note}</div>
            </div>
            <Badge>{h.status}</Badge>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Chart title="Income vs expense">
          <BarChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Income" fill={C[0]} radius={[4, 4, 0, 0]} /><Bar dataKey="Expense" fill={C[1]} radius={[4, 4, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Savings trend">
          <LineChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Line dataKey="Savings" stroke={C[0]} strokeWidth={2.5} dot={false} /></LineChart>
        </Chart>
        <Chart title={`Expense by category · ${plabel}`}>
          <PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">{pie.map((_, i) => <Cell key={i} fill={C[i % 5]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </Chart>
        <Chart title="Borrowings by lender (outstanding)">
          <BarChart data={byLender} layout="vertical"><XAxis type="number" {...axis} tickFormatter={inrCompact} /><YAxis type="category" dataKey="name" {...axis} width={110} /><Tooltip {...tip} /><Bar dataKey="value" name="Outstanding" fill={C[1]} radius={[0, 4, 4, 0]} /></BarChart>
        </Chart>
        <Chart title="Lending by borrower (outstanding)">
          <BarChart data={byBorrower} layout="vertical"><XAxis type="number" {...axis} tickFormatter={inrCompact} /><YAxis type="category" dataKey="name" {...axis} width={110} /><Tooltip {...tip} /><Bar dataKey="value" name="Outstanding" fill={C[2]} radius={[0, 4, 4, 0]} /></BarChart>
        </Chart>
        <Chart title="Interest paid vs received">
          <BarChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Interest Paid" fill={C[1]} radius={[4, 4, 0, 0]} /><Bar dataKey="Interest Received" fill={C[0]} radius={[4, 4, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="EMI commitments · next 12 months">
          <BarChart data={emi12}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Bar dataKey="EMI" fill={C[3]} radius={[4, 4, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Cash inflow vs outflow">
          <AreaChart data={series}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /><Area dataKey="Inflow" stroke={C[0]} fill={C[0]} fillOpacity={0.15} /><Area dataKey="Outflow" stroke={C[1]} fill={C[1]} fillOpacity={0.15} /></AreaChart>
        </Chart>
        <Chart title="Assets vs liabilities">
          <BarChart data={[
            { name: "Cash & bank", Assets: pf.cash }, { name: "Receivables", Assets: pf.lentOut }, { name: "Investments", Assets: pf.invested + pf.otherAssets },
            { name: "Private loans", Liabilities: pf.borrowOut }, { name: "EMI loans", Liabilities: pf.emiOut },
          ]}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={inrCompact} width={60} /><Tooltip {...tip} /><Bar dataKey="Assets" stackId="a" fill={C[0]} radius={[4, 4, 0, 0]} /><Bar dataKey="Liabilities" stackId="a" fill={C[1]} radius={[4, 4, 0, 0]} /></BarChart>
        </Chart>
        <Chart title="Debt repayment progress">
          <BarChart data={debtProgress} layout="vertical"><XAxis type="number" domain={[0, 100]} {...axis} unit="%" /><YAxis type="category" dataKey="name" {...axis} width={80} /><Tooltip {...tip} formatter={(v: number) => `${v}%`} /><Bar dataKey="Repaid %" fill={C[2]} radius={[0, 4, 4, 0]} background={{ fill: "var(--muted)", radius: 4 }} /></BarChart>
        </Chart>
      </div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Panel title={title}>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </Panel>
  );
}
