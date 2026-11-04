import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDB, upsert, saveTx, uid, setDB } from "@/lib/store";
import { emiInterestSaved, emiSchedule, loanSummary, pmt } from "@/lib/accountingEngine";
import { InterestCalendarView, PrincipalRegister, RiskBadge, SettleDialog, SettlementPlanner } from "@/components/fin/LoanTools";
import { fmtDate, inr, todayISO } from "@/lib/format";
import type { CalcMethod, EmiLoan, PrivateLoan, Transaction } from "@/lib/types";
import { Badge, Field, Input, PageHeader, Panel, Select, Stat, Table } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/fin/TransactionDialog";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "Loans, Lending & EMIs — Kanakku" },
      { name: "description", content: "Interest-only borrowings, money lent, interest ledgers and EMI amortisation schedules." },
      { property: "og:title", content: "Loans, Lending & EMIs — Kanakku" },
      { property: "og:description", content: "Track every private loan and EMI with automatic interest ledgers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Loans,
});

type Tab = "BORROWED" | "LENT" | "EMI" | "CAL" | "REG";

function Loans() {
  const db = useDB();
  const today = todayISO();
  const [tab, setTab] = useState<Tab>("BORROWED");
  const [sel, setSel] = useState<string>("");
  const [txOpen, setTxOpen] = useState(false);
  const [txInit, setTxInit] = useState<Partial<Transaction>>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PrivateLoan>();
  const [settling, setSettling] = useState<PrivateLoan>();
  const del = (l: PrivateLoan) => {
    if (!confirm(`Delete ${l.loanId} (${l.counterparty}) and all its linked transactions?`)) return;
    const key = l.kind === "BORROWED" ? "relatedBorrowingId" : "relatedLendingId";
    setDB((d) => ({ ...d, [l.kind === "BORROWED" ? "borrowings" : "lendings"]: (l.kind === "BORROWED" ? d.borrowings : d.lendings).filter((x) => x.loanId !== l.loanId), transactions: d.transactions.filter((t) => t[key] !== l.loanId) }));
    toast.success("Loan deleted");
  };
  const quick = (init: Partial<Transaction>) => { setTxInit(init); setTxOpen(true); };

  const list = tab === "BORROWED" ? db.borrowings : tab === "LENT" ? db.lendings : [];
  const current = sel || (tab === "EMI" ? db.emiLoans[0]?.loanId : list[0]?.loanId) || "";

  return (
    <div>
      <PageHeader title="Loans & lending" subtitle="Principal and interest are tracked separately, as the rules require."
        actions={(tab === "CAL" || tab === "REG") ? undefined : <Button onClick={() => { setEditing(undefined); setAdding(!adding); }}><Plus /> New {tab === "EMI" ? "EMI loan" : tab === "LENT" ? "lending" : "borrowing"}</Button>} />
      <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-lg border p-1 sm:inline-flex">
        {([["BORROWED", "Borrowings"], ["LENT", "Money lent"], ["EMI", "EMI loans"], ["CAL", "Calendars"], ["REG", "Principal register"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSel(""); setAdding(false); setEditing(undefined); }} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {adding && (tab === "EMI" ? <AddEmi onDone={() => setAdding(false)} /> : (tab === "BORROWED" || tab === "LENT") && <AddPrivate key={editing?.loanId ?? "new"} kind={tab} edit={editing} onDone={() => { setAdding(false); setEditing(undefined); }} />)}

      {tab === "CAL" ? (
        <div className="space-y-4"><InterestCalendarView kind="BORROWED" /><InterestCalendarView kind="LENT" /></div>
      ) : tab === "REG" ? (
        <PrincipalRegister />
      ) : tab !== "EMI" ? (
        <>
          <PortfolioStrip kind={tab} />
          {tab === "BORROWED" && <div className="mb-4"><SettlementPlanner loans={db.borrowings} /></div>}
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {list.map((l) => {
              const s = loanSummary(l, db.transactions, today);
              return (
                <div key={l.loanId} onClick={() => setSel(l.loanId)} className={`panel cursor-pointer p-4 text-left ${current === l.loanId ? "glow" : ""}`}>
                  <div className="flex justify-between gap-2"><div><div className="font-semibold">{l.counterparty}</div><div className="num text-xs text-muted-foreground">{l.loanId} · {methodLabel(l)}</div></div>
                    <div className="flex flex-wrap justify-end gap-1"><Badge>{s.status}</Badge>{l.kind === "LENT" && <RiskBadge risk={s.risk} />}</div></div>
                  <div className="num mt-3 text-xl font-bold">{inr(s.outstanding)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Outstanding · {inr(s.monthlyInterest)}/month · unpaid interest <span className="num text-warning">{inr(s.unpaidInterest)}</span>{s.daysOverdue > 0 && <> · <span className="text-destructive">{s.daysOverdue}d overdue</span></>}</div>
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {s.outstanding > 0 && <Button size="sm" onClick={() => setSettling(l)}>{l.kind === "BORROWED" ? "Repay / settle" : "Record recovery"}</Button>}
                    <Button size="sm" variant="outline" aria-label="Edit loan" onClick={() => { setEditing(l); setAdding(true); }}><Pencil /></Button>
                    <Button size="sm" variant="outline" aria-label="Delete loan" onClick={() => del(l)}><Trash2 /></Button>
                  </div>
                </div>
              );
            })}
            {!list.length && <p className="text-sm text-muted-foreground">No loans yet.</p>}
          </div>
          {list.filter((l) => l.loanId === current).map((l) => <PrivateDetail key={l.loanId} loan={l} onQuick={quick} />)}
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {db.emiLoans.map((l) => {
              const s = emiSchedule(l, db.transactions);
              return (
                <button key={l.loanId} onClick={() => setSel(l.loanId)} className={`panel p-4 text-left ${current === l.loanId ? "glow" : ""}`}>
                  <div className="flex justify-between"><div><div className="font-semibold">{l.lender} · {l.loanType}</div><div className="num text-xs text-muted-foreground">{l.loanId} · {l.annualRate}% p.a.</div></div><Badge>{s.status}</Badge></div>
                  <div className="num mt-3 text-xl font-bold">{inr(s.outstanding)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">EMI <span className="num">{inr(s.emi)}</span> · {s.remaining} months left</div>
                </button>
              );
            })}
          </div>
          {db.emiLoans.filter((l) => l.loanId === current).map((l) => <EmiDetail key={l.loanId} loan={l} onQuick={quick} />)}
        </>
      )}
      {settling && <SettleDialog loan={settling} open={!!settling} onOpenChange={(o) => !o && setSettling(undefined)} />}
      <TransactionDialog open={txOpen} onOpenChange={setTxOpen} initial={txInit} />
    </div>
  );
}

const methodLabel = (l: PrivateLoan) => ({
  FIXED_MONTHLY_RATE: `${l.monthlyInterestRate}%/month`, ANNUAL_DIV_12: `${l.annualInterestRate}% p.a. ÷ 12`,
  DAILY_ACTUAL: `${l.annualInterestRate}% p.a. daily`, MANUAL_AMOUNT: `${inr(l.manualInterestAmount ?? 0)}/month fixed`,
}[l.calculationMethod]);

function PortfolioStrip({ kind }: { kind: "BORROWED" | "LENT" }) {
  const db = useDB();
  const today = todayISO();
  const B = kind === "BORROWED";
  const ss = (B ? db.borrowings : db.lendings).map((l) => loanSummary(l, db.transactions, today));
  const sum = (f: (s: (typeof ss)[number]) => number) => ss.reduce((a, s) => a + f(s), 0);
  const atRisk = ss.filter((s) => s.daysOverdue > 90).length;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
      <Stat label={B ? "Total outstanding debt" : "Total receivable"} value={inr(sum((s) => s.outstanding))} tone="brand" hint={`${ss.filter((s) => s.status !== "CLOSED").length} active`} />
      <Stat label={B ? "Monthly interest payable" : "Monthly interest expected"} value={inr(sum((s) => s.monthlyInterest))} />
      <Stat label={B ? "Interest paid to date" : "Interest collected (income)"} value={inr(sum((s) => s.interestSettled))} tone={B ? "bad" : "good"} />
      <Stat label="Unpaid / overdue interest" value={inr(sum((s) => s.unpaidInterest))} tone={sum((s) => s.overdueInterest) ? "bad" : "default"} hint={`Overdue ${inr(sum((s) => s.overdueInterest))}`} />
      <Stat label={B ? "Principal repaid" : "At-risk borrowers (>90d)"} value={B ? inr(sum((s) => s.repaid)) : String(atRisk)} tone={!B && atRisk ? "bad" : "default"} />
    </div>
  );
}

function PrivateDetail({ loan, onQuick }: { loan: PrivateLoan; onQuick: (t: Partial<Transaction>) => void }) {
  const db = useDB();
  const s = loanSummary(loan, db.transactions, todayISO());
  const B = loan.kind === "BORROWED";
  const link = B ? { relatedBorrowingId: loan.loanId } : { relatedLendingId: loan.loanId };
  const base = { ...link, relatedPerson: loan.counterparty, accountId: db.accounts[0]?.id };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Original principal" value={inr(s.original)} />
        <Stat label={B ? "Additional borrowed" : "Additional lent"} value={inr(s.additional)} />
        <Stat label={B ? "Principal repaid" : "Principal recovered"} value={inr(s.repaid)} tone="good" />
        <Stat label="Outstanding principal" value={inr(s.outstanding)} tone="brand" />
        <Stat label={B ? "Interest paid" : "Interest received"} value={inr(s.interestSettled)} />
        <Stat label="Overdue interest" value={inr(s.overdueInterest)} tone={s.overdueInterest ? "bad" : "default"} />
        <Stat label="Monthly interest now" value={inr(s.monthlyInterest)} hint={methodLabel(loan)} />
        <Stat label="Interest accrued to date" value={inr(s.interestAccrued)} hint={B ? "" : "Expected — not income until received"} />
        <Stat label="Unpaid interest" value={inr(s.unpaidInterest)} tone={s.unpaidInterest ? "warn" : "default"} />
        <Stat label="Days overdue" value={String(s.daysOverdue)} tone={s.daysOverdue ? "bad" : "default"} hint={B ? "" : `Risk: ${s.risk}`} />
        <Stat label="Next due" value={s.nextDue ? fmtDate(s.nextDue.dueDate) : "—"} hint={s.nextDue ? inr(s.nextDue.balancePayableOrReceivable) : ""} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onQuick({ ...base, type: B ? "Interest Paid on Borrowing" : "Interest Received from Money Lent", amount: s.nextDue?.balancePayableOrReceivable ?? 0, mainCategory: "Interest", description: `Interest · ${loan.counterparty}` })}>Record interest</Button>
        <Button size="sm" variant="outline" onClick={() => onQuick({ ...base, type: B ? "Principal Repayment on Borrowing" : "Principal Received from Borrower", mainCategory: "Loans" })}>Record principal {B ? "repayment" : "recovery"}</Button>
        <Button size="sm" variant="outline" onClick={() => onQuick({ ...base, type: B ? "Money Borrowed" : "Money Lent to Another Person", mainCategory: "Loans", description: "Top-up" })}>Top-up</Button>
      </div>
      <Panel title="Interest ledger">
        <Table empty={!s.ledger.length} head={["#", "Period", "Due date", "Opening principal", "Rate", "Accrued", B ? "Paid" : "Received", "Balance", "Paid on", "Ref", "Status"]}>
          {s.ledger.map((r) => (
            <tr key={r.period}>
              <td>{r.period}</td><td className="num text-xs">{fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)}</td><td className="num">{fmtDate(r.dueDate)}</td>
              <td className="num">{inr(r.openingPrincipal)}</td><td className="num">{r.applicableRate}%</td><td className="num">{inr(r.interestAccrued)}</td>
              <td className="num text-success">{inr(r.amountPaidOrReceived)}</td><td className="num">{inr(r.balancePayableOrReceivable)}</td>
              <td className="num">{fmtDate(r.paymentDate)}</td><td className="num text-xs">{r.reference ?? "—"}</td><td><Badge>{r.status}</Badge></td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Principal movements">
        <Table empty={!s.moves.length} head={["Date", "Tx", "Opening", "Added", "Settled", "Closing", "Type", "Account"]}>
          {s.moves.map((m) => (
            <tr key={m.transactionId}>
              <td className="num">{fmtDate(m.date)}</td><td className="num text-xs">{m.transactionId}</td><td className="num">{inr(m.openingPrincipal)}</td>
              <td className="num">{inr(m.additionalPrincipal)}</td><td className="num text-success">{inr(m.principalSettled)}</td><td className="num font-semibold">{inr(m.closingPrincipal)}</td>
              <td>{m.settlementType}</td><td>{db.accounts.find((a) => a.id === m.accountId)?.name}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function EmiDetail({ loan, onQuick }: { loan: EmiLoan; onQuick: (t: Partial<Transaction>) => void }) {
  const db = useDB();
  const s = emiSchedule(loan, db.transactions);
  const base = { relatedEmiId: loan.loanId, relatedPerson: loan.lender, accountId: db.accounts[0]?.id };
  const interestPaid = s.rows.filter((r) => r.paid).reduce((a, r) => a + r.interest, 0);
  const saved = emiInterestSaved(loan, db.transactions);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Loan amount" value={inr(loan.originalAmount)} />
        <Stat label="Contractual EMI" value={inr(s.emi)} hint={`${loan.tenureMonths} months @ ${loan.annualRate}%`} />
        <Stat label="Outstanding" value={inr(s.outstanding)} tone="brand" />
        <Stat label="Remaining tenure" value={`${s.remaining} months`} hint={s.totalPrepaid ? `Prepaid ${inr(s.totalPrepaid)}` : ""} />
        <Stat label="Interest paid so far" value={inr(interestPaid)} tone="bad" />
        <Stat label="Next EMI" value={s.next ? inr(s.next.emi) : "—"} hint={s.next ? fmtDate(s.next.dueDate) : ""} />
        <Stat label="Interest saved by prepayment" value={inr(saved.saved)} tone="good" hint={saved.monthsSaved ? `${saved.monthsSaved} months shorter` : ""} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!s.next} onClick={() => s.next && onQuick({ ...base, type: "EMI Payment", amount: s.next.emi, interestComponent: s.next.interest, principalComponent: s.next.principal, date: s.next.dueDate, mainCategory: "EMI", paymentMethod: "Auto-Debit", description: `EMI ${s.next.n}` })}>Pay next EMI</Button>
        <Button size="sm" variant="outline" onClick={() => onQuick({ ...base, type: "Principal Repayment on Borrowing", mainCategory: "Loans", description: "Part-prepayment" })}>Prepay principal</Button>
      </div>
      <Panel title="Amortisation schedule (recalculates after prepayments)">
        <Table head={["#", "Due", "Opening", "Prepaid", "EMI", "Interest", "Principal", "Closing", "Split source", "Status"]}>
          {s.rows.map((r) => (
            <tr key={r.n}>
              <td>{r.n}</td><td className="num">{fmtDate(r.dueDate)}</td><td className="num">{inr(r.opening)}</td><td className="num text-info">{r.prepayment ? inr(r.prepayment) : "—"}</td>
              <td className="num">{inr(r.emi)}</td><td className="num text-destructive">{inr(r.interest)}</td><td className="num text-success">{inr(r.principal)}</td><td className="num">{inr(r.closing)}</td>
              <td className="text-xs">{r.source}</td><td><Badge>{r.paid ? "PAID" : r.dueDate < todayISO() ? "OVERDUE" : "UPCOMING"}</Badge></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function AddPrivate({ kind, onDone, edit }: { kind: "BORROWED" | "LENT"; onDone: () => void; edit?: PrivateLoan }) {
  const db = useDB();
  const [f, setF] = useState(edit ? {
    name: edit.counterparty, amount: String(edit.originalPrincipal), method: edit.calculationMethod, start: edit.startDate, due: String(edit.interestDueDay),
    rate: String(edit.calculationMethod === "FIXED_MONTHLY_RATE" ? edit.monthlyInterestRate : edit.calculationMethod === "MANUAL_AMOUNT" ? edit.manualInterestAmount ?? 0 : edit.annualInterestRate),
    account: "", maturity: edit.maturityDate ?? "", collateral: edit.collateral ?? "", purpose: edit.purpose ?? "",
  } : { name: "", amount: "", rate: "2", method: "FIXED_MONTHLY_RATE" as CalcMethod, start: todayISO(), due: "5", account: db.accounts[0]?.id ?? "", maturity: "", collateral: "", purpose: "" });
  const save = () => {
    const amt = Number(f.amount);
    if (!f.name || !(amt > 0) || (!edit && !f.account)) return toast.error("Name, amount and account are required");
    const loanId = edit?.loanId ?? uid(kind === "BORROWED" ? "BRW" : "LND");
    const rate = Number(f.rate);
    const loan: PrivateLoan = {
      ...edit, loanId, kind, counterparty: f.name, originalPrincipal: amt, startDate: f.start, monthlyInterestRate: f.method === "FIXED_MONTHLY_RATE" ? rate : rate / 12,
      annualInterestRate: f.method === "FIXED_MONTHLY_RATE" ? rate * 12 : rate, calculationMethod: f.method, manualInterestAmount: f.method === "MANUAL_AMOUNT" ? rate : undefined,
      paymentFrequency: "Monthly", interestDueDay: Number(f.due) || 1, maturityDate: f.maturity || undefined, collateral: f.collateral, purpose: f.purpose,
    };
    if (edit) loan.originalPrincipal = edit.originalPrincipal;
    upsert(kind === "BORROWED" ? "borrowings" : "lendings", loan, "loanId");
    if (edit) { toast.success("Loan terms updated — ledger recalculated"); return onDone(); }
    saveTx({
      id: uid("TX"), date: f.start, type: kind === "BORROWED" ? "Money Borrowed" : "Money Lent to Another Person", amount: amt, accountId: f.account,
      relatedPerson: f.name, ...(kind === "BORROWED" ? { relatedBorrowingId: loanId } : { relatedLendingId: loanId }),
      mainCategory: "Loans", subCategory: "", description: `${kind === "BORROWED" ? "Borrowed from" : "Lent to"} ${f.name}`, paymentMethod: "NEFT", source: "Manual",
    } as Transaction);
    toast.success("Loan created and cash movement recorded");
    onDone();
  };
  return (
    <Panel title={edit ? `Edit ${edit.loanId}` : kind === "BORROWED" ? "New borrowing" : "New money lent"} className="mb-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={kind === "BORROWED" ? "Lender name" : "Borrower name"}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={edit ? "Principal (₹) — change via repay/top-up" : "Principal (₹)"}><Input type="number" disabled={!!edit} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Method"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as CalcMethod })}>
          <option value="FIXED_MONTHLY_RATE">Fixed % per month</option><option value="ANNUAL_DIV_12">Annual % ÷ 12</option><option value="DAILY_ACTUAL">Daily actual (annual %)</option><option value="MANUAL_AMOUNT">Manual ₹ per month</option>
        </Select></Field>
        <Field label={f.method === "FIXED_MONTHLY_RATE" ? "Rate % per month" : f.method === "MANUAL_AMOUNT" ? "₹ per month" : "Rate % per year"}><Input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Start date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Interest due day (1–31)"><Input type="number" min={1} max={31} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        {!edit && <Field label={kind === "BORROWED" ? "Received into" : "Paid from"}><Select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
        <Field label="Maturity / repayment date"><Input type="date" value={f.maturity} onChange={(e) => setF({ ...f, maturity: e.target.value })} /></Field>
        <Field label="Collateral"><Input value={f.collateral} onChange={(e) => setF({ ...f, collateral: e.target.value })} /></Field>
      </div>
      <Button className="mt-3" onClick={save}>Save</Button>
    </Panel>
  );
}

function AddEmi({ onDone }: { onDone: () => void }) {
  const db = useDB();
  const [f, setF] = useState({ lender: "", type: "Personal" as EmiLoan["loanType"], amount: "", rate: "10.5", tenure: "36", disb: todayISO(), start: "", day: "5", fee: "0", account: db.accounts[0]?.id ?? "" });
  const preview = Number(f.amount) > 0 ? Math.round(pmt(Number(f.amount), Number(f.rate), Number(f.tenure) || 1)) : 0;
  const save = () => {
    const amt = Number(f.amount);
    if (!f.lender || !(amt > 0) || !f.start) return toast.error("Lender, amount and EMI start date are required");
    const loanId = uid("EMI");
    upsert("emiLoans", { loanId, lender: f.lender, loanType: f.type, originalAmount: amt, disbursementDate: f.disb, annualRate: Number(f.rate), tenureMonths: Number(f.tenure), emiStartDate: f.start, emiDay: Number(f.day), processingFee: Number(f.fee) }, "loanId");
    saveTx({ id: uid("TX"), date: f.disb, type: "Money Borrowed", amount: amt, accountId: f.account, relatedEmiId: loanId, relatedPerson: f.lender, mainCategory: "Loans", subCategory: "", description: `${f.type} loan disbursement`, paymentMethod: "NEFT", source: "Manual" } as Transaction);
    toast.success("EMI loan created");
    onDone();
  };
  return (
    <Panel title="New EMI loan" className="mb-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Lender"><Input value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EmiLoan["loanType"] })}>{["Home", "Personal", "Vehicle", "Business", "Education", "Consumer"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Loan amount (₹)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Rate % p.a."><Input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Tenure (months)"><Input type="number" value={f.tenure} onChange={(e) => setF({ ...f, tenure: e.target.value })} /></Field>
        <Field label="Disbursement date"><Input type="date" value={f.disb} onChange={(e) => setF({ ...f, disb: e.target.value })} /></Field>
        <Field label="First EMI date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="EMI day"><Input type="number" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
        <Field label="Disbursed into"><Select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      </div>
      <div className="mt-3 flex items-center gap-3"><Button onClick={save}>Save</Button>{preview > 0 && <span className="text-sm text-muted-foreground">EMI ≈ <b className="num text-foreground">{inr(preview)}</b></span>}</div>
    </Panel>
  );
}
