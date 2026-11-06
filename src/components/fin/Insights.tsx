import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { useDB } from "@/lib/store";
import { computeDashboard, categoryColorMap } from "@/lib/dashboardData";
import { addMonths, fyLabel, fyStart, monthKey, monthLabel, monthShort, todayISO, money } from "@/lib/format";
import { Badge, Select } from "@/components/fin/ui";
import { ChartCard, SectionCard, StatCard, chartAxis, chartGrid, chartMoney, chartTip } from "@/components/fin/kit";
import { cn } from "@/lib/utils";

/** Reports > Insights: all KPIs, 8 health indicators and 10 charts formerly on the dashboard. */
export function InsightsView() {
  const db = useDB();
  const today = todayISO();
  const [period, setPeriod] = useState(`FY:${fyStart(today)}`);
  const opts = useMemo(() => ({
    months: [...new Set([monthKey(today), ...db.transactions.map((t) => monthKey(t.date))])].sort().reverse(),
    fys: [...new Set([fyStart(today), ...db.transactions.map((t) => fyStart(t.date))])].sort().reverse(),
  }), [db.transactions, today]);
  const { pf, s, thisMonth, series, pie, health } = useMemo(() => computeDashboard(db, period, today), [db, period, today]);
  const colors = categoryColorMap(db, pie.map((p) => p.name));
  const byLender = pf.borrowings.map((x) => ({ name: x.loan.counterparty, value: x.s.outstanding })).concat(pf.emis.map((x) => ({ name: `${x.loan.lender} EMI`, value: x.s.outstanding })));
  const byBorrower = pf.lendings.map((x) => ({ name: x.loan.counterparty, value: x.s.outstanding }));
  const emi12 = Array.from({ length: 12 }, (_, i) => { const k = monthKey(addMonths(today, i, 1)); return { month: monthShort(k), EMI: pf.emis.reduce((sum, e) => sum + e.s.rows.filter((r) => monthKey(r.dueDate) === k).reduce((a, r) => a + r.emi, 0), 0) }; });
  const debtProgress = [
    ...pf.borrowings.map((x) => ({ name: x.loan.loanId, total: x.s.original + x.s.additional, repaid: x.s.repaid })),
    ...pf.emis.map((x) => ({ name: x.loan.loanId, total: x.loan.originalAmount, repaid: x.loan.originalAmount - x.s.outstanding })),
  ].map((d) => ({ name: d.name, "Repaid %": d.total ? Math.round((d.repaid / d.total) * 100) : 0 }));
  const plabel = period === "ALL" ? "All time" : period.startsWith("M:") ? monthLabel(period.slice(2)) : fyLabel(Number(period.slice(3)));
  const netInterest = s.interestReceived - s.interestPaid - s.emiInterest;
  const kpis: { label: string; value: number; hint?: string; tone?: "income" | "expense" | "plain" }[] = [
    { label: "Total income", value: s.income, hint: plabel, tone: "income" },
    { label: "Total expenses", value: s.expense, hint: "Incl. interest, excl. principal", tone: "expense" },
    { label: "Savings", value: s.savings, hint: plabel },
    { label: "Interest paid (month)", value: thisMonth.interestPaid + thisMonth.emiInterest, hint: monthLabel(monthKey(today)), tone: "plain" },
    { label: "Interest received (month)", value: thisMonth.interestReceived, hint: "Realised only", tone: "plain" },
    { label: "EMI payments (month)", value: thisMonth.emiPaid, hint: `Principal ${money(thisMonth.emiPrincipal, true)}`, tone: "plain" },
    { label: "Upcoming EMIs (30d)", value: pf.upcomingEmiAmount, hint: `${pf.upcomingEmis.length} instalment(s)`, tone: "plain" },
    { label: "Net interest cash flow", value: netInterest, hint: "Interest received − paid" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{plabel}</span>
        <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44">
          <option value="ALL">All time</option>
          <optgroup label="Financial year">{opts.fys.map((y) => <option key={y} value={`FY:${y}`}>{fyLabel(y)}</option>)}</optgroup>
          <optgroup label="Month">{opts.months.map((m) => <option key={m} value={`M:${m}`}>{monthLabel(m)}</option>)}</optgroup>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map((k) => <StatCard key={k.label} {...k} />)}</div>

      <SectionCard title="Financial health" action={<span className="text-[12.5px] text-muted-foreground">{health.filter((h) => h.status === "Healthy").length} / 8 healthy</span>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {health.map((h) => (
            <div key={h.name} className="rounded-[var(--radius)] bg-muted/60 p-4">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[12.5px] text-muted-foreground">{h.name}</span><Badge>{h.status}</Badge></div>
              <div className="num my-2 text-[17px] font-semibold">{typeof h.value === "number" ? money(h.value) : h.value}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", h.status === "Healthy" ? "w-full bg-income" : h.status === "Caution" ? "w-2/3 bg-warning" : "w-1/3 bg-expense")} /></div>
              <p className="mt-2 text-[12px] text-muted-foreground">{h.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Income vs expense"><BarChart data={series}><CartesianGrid {...chartGrid} /><XAxis dataKey="month" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Bar dataKey="Income" fill="var(--income)" radius={4} maxBarSize={10} /><Bar dataKey="Expense" fill="var(--expense)" radius={4} maxBarSize={10} /></BarChart></ChartCard>
        <ChartCard title="Savings trend"><LineChart data={series}><CartesianGrid {...chartGrid} /><XAxis dataKey="month" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Line dataKey="Savings" stroke="var(--primary)" strokeWidth={2.5} dot={false} /></LineChart></ChartCard>
        <ChartCard title="Expense by category" summary={plabel}><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2} cornerRadius={4} stroke="none">{pie.map((p) => <Cell key={p.name} fill={colors[p.name]} />)}</Pie><Tooltip {...chartTip} /></PieChart></ChartCard>
        <ChartCard title="Borrowings by lender" summary="Current principal"><BarChart data={byLender} layout="vertical"><XAxis type="number" {...chartAxis} tickFormatter={chartMoney} /><YAxis type="category" dataKey="name" {...chartAxis} width={100} /><Tooltip {...chartTip} /><Bar dataKey="value" name="Outstanding" fill="var(--expense)" radius={4} maxBarSize={12} /></BarChart></ChartCard>
        <ChartCard title="Lending by borrower" summary="Current principal"><BarChart data={byBorrower} layout="vertical"><XAxis type="number" {...chartAxis} tickFormatter={chartMoney} /><YAxis type="category" dataKey="name" {...chartAxis} width={100} /><Tooltip {...chartTip} /><Bar dataKey="value" name="Outstanding" fill="var(--info)" radius={4} maxBarSize={12} /></BarChart></ChartCard>
        <ChartCard title="Interest paid vs received"><BarChart data={series}><CartesianGrid {...chartGrid} /><XAxis dataKey="month" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Bar dataKey="Interest Paid" fill="var(--expense)" radius={4} maxBarSize={10} /><Bar dataKey="Interest Received" fill="var(--income)" radius={4} maxBarSize={10} /></BarChart></ChartCard>
        <ChartCard title="EMI commitments" summary="Next 12 months"><BarChart data={emi12}><CartesianGrid {...chartGrid} /><XAxis dataKey="month" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Bar dataKey="EMI" fill="var(--warning)" radius={4} maxBarSize={12} /></BarChart></ChartCard>
        <ChartCard title="Cash inflow vs outflow"><AreaChart data={series}><defs><linearGradient id="ins-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--income)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--income)" stopOpacity={0} /></linearGradient><linearGradient id="ins-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--expense)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--expense)" stopOpacity={0} /></linearGradient></defs><CartesianGrid {...chartGrid} /><XAxis dataKey="month" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Area dataKey="Inflow" stroke="var(--income)" fill="url(#ins-in)" /><Area dataKey="Outflow" stroke="var(--expense)" fill="url(#ins-out)" /></AreaChart></ChartCard>
        <ChartCard title="Assets vs liabilities"><BarChart data={[{ name: "Cash", Assets: pf.cash }, { name: "Receivables", Assets: pf.lentOut }, { name: "Investments", Assets: pf.invested + pf.otherAssets }, { name: "Private loans", Liabilities: pf.borrowOut }, { name: "EMI loans", Liabilities: pf.emiOut }]}><CartesianGrid {...chartGrid} /><XAxis dataKey="name" {...chartAxis} /><YAxis {...chartAxis} tickFormatter={chartMoney} width={48} /><Tooltip {...chartTip} /><Bar dataKey="Assets" stackId="a" fill="var(--income)" radius={4} maxBarSize={18} /><Bar dataKey="Liabilities" stackId="a" fill="var(--expense)" radius={4} maxBarSize={18} /></BarChart></ChartCard>
        <ChartCard title="Debt repayment progress" summary="Principal repaid · %"><BarChart data={debtProgress} layout="vertical"><XAxis type="number" domain={[0, 100]} {...chartAxis} unit="%" /><YAxis type="category" dataKey="name" {...chartAxis} width={80} /><Tooltip {...chartTip} formatter={(v: number) => `${v}%`} /><Bar dataKey="Repaid %" fill="var(--info)" radius={4} maxBarSize={12} background={{ fill: "var(--muted)", radius: 4 }} /></BarChart></ChartCard>
      </div>
    </div>
  );
}
