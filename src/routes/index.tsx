import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, ChevronRight, HandCoins, Inbox, Landmark, Receipt } from "lucide-react";
import { useDB } from "@/lib/store";
import { summarize, filterByPeriod } from "@/lib/accountingEngine";
import { computeDashboard, monthSeries, monthsFor, upcomingDues, categoryColorMap } from "@/lib/dashboardData";
import { fyLabel, fyStart, monthKey, monthLabel, relDate, todayISO, money } from "@/lib/format";
import { Avatar, useProfile } from "@/components/fin/AppShell";
import { CardLink, ChartCard, CountUpMoney, DeltaChip, ListRow, MoneyText, SectionCard, SegmentedTabs, Skeleton, StatCard, chartAxis, chartGrid, chartMoney, chartTip } from "@/components/fin/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Kanakku" },
      { name: "description", content: "Your net worth, monthly cash flow, spending, loans and upcoming dues in ₹ at a glance." },
      { property: "og:title", content: "Home — Kanakku" },
      { property: "og:description", content: "A calm overview of your money: net worth, cash flow, debts and dues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

function HomePage() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <Home /> : <HomeSkeleton />;
}

function HomeSkeleton() {
  return <div className="space-y-4"><Skeleton className="h-10 w-2/3 rounded-full" /><Skeleton className="h-64 rounded-[var(--radius-card)]" /><Skeleton className="h-40 rounded-[var(--radius-card)]" /><Skeleton className="h-64 rounded-[var(--radius-card)]" /></div>;
}

function Home() {
  const db = useDB();
  const today = todayISO();
  const { name, balancesHidden } = useProfile();
  const [fy, setFy] = useState(fyStart(today));
  const [scope, setScope] = useState<"month" | "fy">("month");
  const [range, setRange] = useState<"L:6" | "L:12" | "FY">("L:6");

  const fys = useMemo(() => [...new Set([fyStart(today), ...db.transactions.map((t) => fyStart(t.date))])].sort().reverse(), [db.transactions, today]);
  const d = useMemo(() => computeDashboard(db, `FY:${fy}`, today), [db, fy, today]);
  const { pf, thisMonth } = d;
  const fySummary = d.s;
  const period = scope === "month" ? thisMonth : fySummary;

  const flow = useMemo(() => monthSeries(db, monthsFor(range === "FY" ? `FY:${fy}` : range, db.transactions, today)), [db, range, fy, today]);
  // Net worth path: today's net worth stepped back by each later month's savings (income − expense).
  const spark = useMemo(() => {
    const ser = monthSeries(db, monthsFor("L:6", db.transactions, today));
    let nw = pf.netWorth; const out: { v: number }[] = [];
    for (let i = ser.length - 1; i >= 0; i--) { out.unshift({ v: nw }); nw -= ser[i].Savings; }
    return out;
  }, [db, pf.netWorth, today]);

  const spendTxs = scope === "month" ? filterByPeriod(db.transactions, `M:${monthKey(today)}`) : d.txs;
  const cats = useMemo(() => {
    const all = Object.entries(summarize(spendTxs).byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 5).map(([name, value]) => ({ name, value }));
    const other = all.slice(5).reduce((n, [, v]) => n + v, 0);
    return other > 0 ? [...top, { name: "Other", value: other }] : top;
  }, [spendTxs]);
  const catTotal = cats.reduce((n, c) => n + c.value, 0);
  const colors = categoryColorMap(db, cats.map((c) => c.name));

  const dues = upcomingDues(db, today, 30);
  const pending = (db.bankSync?.rows ?? []).filter((r) => r.status === "PENDING").length;
  const attention = [
    pf.overdueReceivables > 0 && { key: "rec", icon: <HandCoins className="size-5" />, title: "Overdue from borrowers", sub: "Interest not yet collected", amount: pf.overdueReceivables, to: "/loans" },
    pf.overduePayables > 0 && { key: "pay", icon: <AlertCircle className="size-5" />, title: "Overdue to lenders", sub: "Interest you still owe", amount: pf.overduePayables, to: "/loans" },
    pending > 0 && { key: "inbox", icon: <Inbox className="size-5" />, title: `${pending} bank ${pending === 1 ? "entry" : "entries"} to review`, sub: "Waiting in Bank Sync inbox", to: "/bank-sync" },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; title: string; sub: string; amount?: number; to: string }[];

  const healthy = d.health.filter((h) => h.status === "Healthy").length;
  const weakest = d.health.find((h) => h.status === "Critical") ?? d.health.find((h) => h.status === "Caution");

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-1">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} className="size-11" />
          <div className="min-w-0"><div className="text-[12.5px] text-muted-foreground">{greeting()}{name ? "," : ""}</div><h1 className="truncate text-[22px] font-semibold tracking-tight">{name || "Welcome back"}</h1></div>
        </div>
        <label className="relative">
          <span className="sr-only">Financial year</span>
          <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="pressable h-9 appearance-none rounded-full border bg-card pl-3.5 pr-8 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {fys.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
          <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
        </label>
      </div>

      {/* 2. Net worth hero */}
      <section className="hero-surface fade-in overflow-hidden rounded-[var(--radius-card)] p-5 sm:p-7">
        <div className="text-[12.5px] text-hero-muted">Net worth</div>
        <CountUpMoney value={pf.netWorth} hidden={balancesHidden} className="mt-1 block truncate text-[40px] font-semibold leading-[44px] tracking-tight" />
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
          <DeltaChip value={thisMonth.savings} suffix=" this month" onDark />
          <div className="justify-self-end text-right">
            <div className="mb-1 text-[11px] text-hero-muted">Last 6 months</div>
            <div className="h-10 w-full max-w-48" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                <defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--income)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--income)" stopOpacity={0} /></linearGradient></defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area dataKey="v" stroke="var(--income)" strokeWidth={2} fill="url(#spark)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-hero-foreground/10 pt-4">
          {([["Cash & bank", pf.cash], ["Total assets", pf.totalAssets], ["Total liabilities", pf.totalLiabilities]] as const).map(([label, v]) => (
            <div key={label} className="min-w-0"><div className="truncate text-[12px] text-hero-muted">{label}</div><MoneyText value={v} compact hidden={balancesHidden} tone="plain" className="mt-0.5 block text-[15px] font-semibold sm:text-[17px]" /></div>
          ))}
        </div>
      </section>

      {/* 3. This month / FY */}
      <SectionCard title={scope === "month" ? monthLabel(monthKey(today)) : fyLabel(fy)} action={<SegmentedTabs size="sm" label="Period" value={scope} onChange={setScope} options={[{ value: "month", label: "This month" }, { value: "fy", label: "This FY" }]} />}>
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0"><div className="text-[12.5px] text-muted-foreground">Income</div><MoneyText value={period.income} hidden={balancesHidden} tone="income" className="mt-0.5 block text-[17px] font-semibold" /></div>
          <div className="min-w-0"><div className="text-[12.5px] text-muted-foreground">Expenses</div><MoneyText value={period.expense} hidden={balancesHidden} tone="expense" className="mt-0.5 block text-[17px] font-semibold" /></div>
          <div className="min-w-0"><div className="text-[12.5px] text-muted-foreground">Savings</div><MoneyText value={period.savings} hidden={balancesHidden} className="mt-0.5 block text-[17px] font-semibold" /></div>
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="text-muted-foreground">Savings rate</span><span className="num font-medium">{period.savingsRate.toFixed(1)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-200 ease-out", period.savingsRate >= 0 ? "bg-primary" : "bg-muted-foreground/50")} style={{ width: `${Math.min(100, Math.max(0, Math.abs(period.savingsRate)))}%` }} /></div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Month in progress · updates as transactions are added</p>
        </div>
      </SectionCard>

      <SectionCard title="Upcoming in 30 days" action={dues.length > 3 ? <CardLink to="/statements" search={{ tab: "commitments" }}>See all</CardLink> : undefined}>
        {dues.length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing due in the next 30 days.</p> : (
          <div className="-my-3 divide-y">
            {dues.slice(0, 3).map((r) => {
              const incoming = r.direction === "IN";
              return <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", r.overdue ? "bg-expense/10 text-expense" : incoming ? "bg-income/10 text-income" : "bg-muted text-muted-foreground")}>
                  {r.kind === "EMI" ? <Landmark className="size-5" /> : r.kind.includes("interest") ? <CalendarClock className="size-5" /> : <Receipt className="size-5" />}
                </span>
                <span className="min-w-0"><span className="flex items-center gap-1.5 text-[15px] font-medium"><span className={incoming ? "text-income" : "text-expense"}>{incoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><span className="break-words">{r.name}</span></span><span className={cn("block text-[12.5px]", r.overdue ? "font-medium text-expense" : "text-muted-foreground")}>{r.overdue ? "Overdue" : relDate(r.date, today)} · {r.kind}</span></span>
                <MoneyText value={r.amount} hidden={balancesHidden} tone={incoming ? "income" : "expense"} className="self-center" />
              </div>;
            })}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4. Cash flow */}
        <ChartCard title="Cash flow" summary={<span><span className="text-income">●</span> Income &nbsp;<span className="text-expense">●</span> Expenses</span>}
          action={<SegmentedTabs size="sm" label="Range" value={range} onChange={setRange} options={[{ value: "L:6", label: "6M" }, { value: "L:12", label: "12M" }, { value: "FY", label: "FY" }]} />}>
          <BarChart data={flow} barGap={3} margin={{ left: -8, right: 0, top: 4 }}>
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="month" {...chartAxis} interval={0} minTickGap={0} />
            <YAxis {...chartAxis} tickFormatter={chartMoney} width={48} />
            <Tooltip {...chartTip} trigger="click" />
            <Bar dataKey="Income" fill="var(--income)" radius={[4, 4, 4, 4]} maxBarSize={10} />
            <Bar dataKey="Expense" name="Expenses" fill="var(--expense)" radius={[4, 4, 4, 4]} maxBarSize={10} />
          </BarChart>
        </ChartCard>

        {/* 5. Spending by category */}
        <SectionCard title="Spending by category" action={<span className="text-[12.5px] text-muted-foreground">{scope === "month" ? "This month" : fyLabel(fy)}</span>}>
          {cats.length === 0 ? <p className="py-6 text-center text-[13px] text-muted-foreground">No spending recorded for this period.</p> : (
            <>
              {cats.length === 1 ? (
                <div className="py-6">
                  <div className="mb-2 flex items-center justify-between text-[13px]"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: colors[cats[0].name] }} />{cats[0].name}</span><MoneyText value={cats[0].value} hidden={balancesHidden} /></div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full w-full rounded-full" style={{ background: colors[cats[0].name] }} /></div>
                </div>
              ) : (
                <div className="relative mx-auto h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={cats} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={0} cornerRadius={4} stroke="none">{cats.map((c) => <Cell key={c.name} fill={colors[c.name]} />)}</Pie><Tooltip {...chartTip} trigger="click" /></PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-[12px] text-muted-foreground">Total</div><div className="num text-[17px] font-semibold">{balancesHidden ? "••••" : money(catTotal)}</div></div></div>
                </div>
              )}
              <ol className="mt-4 space-y-3">
                {cats.map((c) => { const pct = catTotal ? (c.value / catTotal) * 100 : 0; return (
                  <li key={c.name}>
                    <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-[14px]">
                      <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[c.name] }} /><span className="truncate">{c.name}</span></span>
                      <span className="num text-[12.5px] text-muted-foreground">{pct.toFixed(0)}%</span>
                      <MoneyText value={c.value} hidden={balancesHidden} tone="plain" className="font-medium" />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[c.name] }} /></div>
                  </li>); })}
              </ol>
            </>
          )}
        </SectionCard>
      </div>

      {/* 6. Debt & lending */}
      <SectionCard title="Debt & lending" action={<CardLink to="/loans">View loans</CardLink>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Outstanding borrowings" value={pf.borrowOut + pf.emiOut} hidden={balancesHidden} hint={balancesHidden ? "Hidden" : `Private ${money(pf.borrowOut, true)} · EMI ${money(pf.emiOut, true)}`} tone="plain" />
          <StatCard label="Monthly obligations" value={pf.monthlyObligations} hidden={balancesHidden} hint="EMI + interest due" tone="plain" />
          <StatCard label="Principal lent out" value={pf.lentOut} hidden={balancesHidden} hint={`${pf.lendings.filter((x) => x.s.outstanding > 0).length} active borrowers`} tone="plain" />
        </div>
      </SectionCard>

      <SectionCard title="Needs attention">
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-[14px] text-muted-foreground"><CheckCircle2 className="size-5 text-income" /> All clear. Nothing overdue or waiting.</p>
          ) : (
            <div className="-my-3 divide-y">
              {attention.map((a) => <Link key={a.key} to={a.to as "/"} className="block"><ListRow icon={a.icon} title={a.title} subtitle={a.sub} trailing={a.amount !== undefined ? <MoneyText value={a.amount} hidden={balancesHidden} tone="expense" /> : <ChevronRight className="size-4 text-muted-foreground" />} /></Link>)}
            </div>
          )}
        </SectionCard>

      {/* 9. Health */}
      <Link to="/statements" search={{ tab: "insights" } as never} className="pressable block">
        <SectionCard>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
            <ScoreRing score={d.score} />
            <div className="min-w-0"><h2 className="text-[17px] font-semibold">Financial health</h2><p className="mt-0.5 text-[13px] text-muted-foreground">{healthy} of {d.health.length} indicators healthy{weakest ? ` · watch ${weakest.name.toLowerCase()}` : ""}</p></div>
            <ChevronRight className="size-5 text-muted-foreground" />
          </div>
        </SectionCard>
      </Link>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const tone = score >= 70 ? "var(--income)" : score >= 40 ? "var(--warning)" : "var(--expense)";
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90"><circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" /><circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} /></svg>
      <span className="num absolute inset-0 grid place-items-center text-[17px] font-semibold">{score}</span>
    </div>
  );
}
