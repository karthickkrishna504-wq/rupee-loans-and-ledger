import { useState } from "react";
import { toast } from "sonner";
import { getDB, saveTx, uid, useDB } from "@/lib/store";
import { interestCalendar, loanSummary, principalMovements, settlementQuote, type RiskLevel } from "@/lib/accountingEngine";
import { fmtDate, inr, todayISO } from "@/lib/format";
import type { PrivateLoan, Transaction, TxType } from "@/lib/types";
import { Badge, Field, Input, Panel, Select, Table } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RISK_TONE: Record<RiskLevel, "good" | "info" | "warn" | "bad" | "muted"> = {
  Low: "good", Watch: "info", Moderate: "warn", High: "bad", Severe: "bad", Closed: "muted",
};
export const RiskBadge = ({ risk }: { risk: RiskLevel }) => <Badge tone={RISK_TONE[risk]}>{`Risk: ${risk}`}</Badge>;

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming", DUE_TODAY: "Due Today", PAID: "Paid", PARTIAL: "Partially Paid", OVERDUE: "Overdue", CLOSED: "Loan Closed",
};
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "muted" | "info"> = {
  UPCOMING: "muted", DUE_TODAY: "warn", PAID: "good", PARTIAL: "warn", OVERDUE: "bad", CLOSED: "muted",
};

/** Records a loan-linked transaction through saveTx so it hits the register and the account balance. */
export function recordLoanTx(loan: PrivateLoan, type: TxType, amount: number, date: string, accountId: string, description: string, reference?: string) {
  const link = loan.kind === "BORROWED" ? { relatedBorrowingId: loan.loanId } : { relatedLendingId: loan.loanId };
  saveTx({
    id: uid("TX"), date, type, amount, accountId, relatedPerson: loan.counterparty, ...link,
    mainCategory: type.startsWith("Interest") ? "Interest" : "Loans", subCategory: "", description,
    paymentMethod: "NEFT", referenceNumber: reference || undefined, source: "Manual",
  } as Transaction);
}

export function SettleDialog({ loan, open, onOpenChange }: { loan: PrivateLoan; open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDB();
  const s = loanSummary(loan, db.transactions, todayISO());
  const B = loan.kind === "BORROWED";
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState(db.accounts[0]?.id ?? "");
  const [ref, setRef] = useState("");
  const amt = Number(amount);
  const after = Math.max(0, s.outstanding - (amt || 0));
  const save = () => {
    if (!(amt > 0)) return toast.error("Enter an amount");
    if (amt > s.outstanding + 0.5) return toast.error(`Cannot exceed outstanding ${inr(s.outstanding)}`);
    if (!account) return toast.error("Choose an account");
    recordLoanTx(loan, B ? "Principal Repayment on Borrowing" : "Principal Received from Borrower", amt, date, account,
      `${after <= 0 ? "Full settlement" : "Partial principal"} · ${loan.counterparty}`, ref);
    toast.success(after <= 0 ? "Loan settled and closed" : `Outstanding now ${inr(after)}`);
    setAmount(""); onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{B ? "Record principal repayment / settle loan" : "Record principal recovery"}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">{loan.counterparty} · outstanding <b className="num text-foreground">{inr(s.outstanding)}</b></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={B ? "Paid from" : "Received into"}><Select value={account} onChange={(e) => setAccount(e.target.value)}>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setAmount(String(s.outstanding))}>Settle in full ({inr(s.outstanding)})</Button>
        <div className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between"><span>Outstanding after</span><b className="num">{inr(after)}</b></div>
          <div className="flex justify-between"><span>Monthly interest now → after</span><b className="num">{inr(s.monthlyInterest)} → {inr(s.outstanding > 0 ? (s.monthlyInterest * after) / s.outstanding : 0)}</b></div>
          <div className="flex justify-between text-muted-foreground"><span>{B ? "Interest paid to date (unchanged)" : "Interest received to date (unchanged)"}</span><span className="num">{inr(s.interestSettled)}</span></div>
          {after <= 0 && amt > 0 && <div className="mt-1 text-success">Loan will be CLOSED and future interest stops.</div>}
        </div>
        <Button onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

export function SettlementPlanner({ loans }: { loans: PrivateLoan[] }) {
  const db = useDB();
  const active = loans.filter((l) => loanSummary(l, db.transactions, todayISO()).status !== "CLOSED");
  const [id, setId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [quote, setQuote] = useState("");
  const loan = active.find((l) => l.loanId === id) ?? active[0];
  if (!loan) return null;
  const q = settlementQuote(loan, db.transactions, date, quote ? Number(quote) : undefined);
  return (
    <Panel title="Settlement planner (simulation — nothing is saved)">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Loan"><Select value={loan.loanId} onChange={(e) => setId(e.target.value)}>{active.map((l) => <option key={l.loanId} value={l.loanId}>{l.counterparty} · {l.loanId}</option>)}</Select></Field>
        <Field label="Proposed settlement date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Lender-confirmed quote (₹)"><Input type="number" value={quote} onChange={(e) => setQuote(e.target.value)} /></Field>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {[["Principal outstanding", q.principal], ["Unpaid interest (completed periods)", q.unpaidInterest], ["Pro-rata interest (running period)", q.runningInterest], ["Computed cash required", q.computed]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="num mt-1 font-semibold">{inr(v as number)}</div></div>
        ))}
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Quote vs computed</div>
          <div className={`num mt-1 font-semibold ${q.difference === undefined ? "" : q.difference > 0 ? "text-destructive" : "text-success"}`}>
            {q.difference === undefined ? "Enter quote" : `${q.difference > 0 ? "+" : ""}${inr(q.difference)}`}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function InterestCalendarView({ kind }: { kind: "BORROWED" | "LENT" }) {
  const db = useDB();
  const today = todayISO();
  const B = kind === "BORROWED";
  const loans = B ? db.borrowings : db.lendings;
  const rows = interestCalendar(loans, db.transactions, today, 12);
  const [account, setAccount] = useState(db.accounts[0]?.id ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const record = (r: (typeof rows)[number]) => {
    const key = `${r.loan.loanId}-${r.period}`;
    const amt = Number(amounts[key] ?? r.balancePayableOrReceivable);
    if (!(amt > 0)) return toast.error("Nothing to record");
    if (!account) return toast.error("Choose an account");
    // FIFO allocation means earlier unpaid periods are cleared first.
    const earlier = interestCalendar([r.loan], getDB().transactions, today, 12).filter((x) => x.dueDate < r.dueDate && x.balancePayableOrReceivable > 0.005);
    if (earlier.length) toast.message("Payment is applied to the oldest unpaid period first");
    recordLoanTx(r.loan, B ? "Interest Paid on Borrowing" : "Interest Received from Money Lent", amt, today, account, `Interest P${r.period} · ${r.loan.counterparty}`);
    setAmounts((a) => { const n = { ...a }; delete n[key]; return n; });
    toast.success(B ? "Interest payment recorded" : "Interest collection recorded as income");
  };
  const due = rows.reduce((s, r) => s + r.balancePayableOrReceivable, 0);
  return (
    <Panel title={B ? "Interest-only borrowing payment calendar (current + 12 months)" : "Interest collection calendar (current + 12 months)"}
      action={<Select className="w-44" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}>
      <div className="mb-3 text-sm text-muted-foreground">{B ? "Scheduled to pay" : "Expected to collect"}: <b className="num text-foreground">{inr(due)}</b> · expected interest is not income until received.</div>
      <Table empty={!rows.length} head={["Due date", B ? "Lender" : "Borrower", "Loan", "Principal", "Interest", B ? "Paid" : "Received", "Balance", "Status", "Amount", ""]}>
        {rows.map((r) => {
          const key = `${r.loan.loanId}-${r.period}`;
          const open = r.balancePayableOrReceivable > 0.005;
          return (
            <tr key={key}>
              <td className="num">{fmtDate(r.dueDate)}</td><td>{r.loan.counterparty}</td><td className="num text-xs">{r.loan.loanId} · P{r.period}</td>
              <td className="num">{inr(r.openingPrincipal)}</td><td className="num">{inr(r.interestAccrued)}</td>
              <td className="num text-success">{inr(r.amountPaidOrReceived)}</td><td className="num">{inr(r.balancePayableOrReceivable)}</td>
              <td><Badge tone={STATUS_TONE[r.calendarStatus]}>{STATUS_LABEL[r.calendarStatus]}</Badge></td>
              <td>{open && <Input className="w-28" type="number" aria-label={`Amount for ${key}`} value={amounts[key] ?? String(r.balancePayableOrReceivable)} onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })} />}</td>
              <td>{open && <Button size="sm" onClick={() => record(r)}>{B ? "Record payment" : "Record collection"}</Button>}</td>
            </tr>
          );
        })}
      </Table>
    </Panel>
  );
}

export function PrincipalRegister() {
  const db = useDB();
  const moves = [...db.borrowings, ...db.lendings].flatMap((l) => principalMovements(l, db.transactions)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Panel title="Principal repayment & settlement register">
      <Table empty={!moves.length} head={["Date", "Direction", "Person", "Loan", "Opening", "Additional", "Repaid / recovered", "Closing", "Settlement type", "Account", "Ref", "Tx"]}>
        {moves.map((m) => (
          <tr key={m.transactionId}>
            <td className="num">{fmtDate(m.date)}</td><td><Badge tone={m.direction === "BORROWED" ? "bad" : "info"}>{m.direction}</Badge></td><td>{m.personName}</td>
            <td className="num text-xs">{m.loanId}</td><td className="num">{inr(m.openingPrincipal)}</td><td className="num">{m.additionalPrincipal ? inr(m.additionalPrincipal) : "—"}</td>
            <td className="num text-success">{m.principalSettled ? inr(m.principalSettled) : "—"}</td><td className="num font-semibold">{inr(m.closingPrincipal)}</td>
            <td>{m.settlementType}</td><td>{db.accounts.find((a) => a.id === m.accountId)?.name ?? "—"}</td><td className="num text-xs">{m.reference ?? "—"}</td><td className="num text-xs">{m.transactionId}</td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
