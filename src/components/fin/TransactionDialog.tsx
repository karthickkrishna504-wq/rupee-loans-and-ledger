import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "./ui";
import { useDB, saveTx, uid, upsert, setDB } from "@/lib/store";
import { TX_TYPES, txMeta, type Transaction, type TxType } from "@/lib/types";
import { methodsForAccount, loanInterestDescription, periodForInterestDate } from "@/lib/txHelpers";
import { emiSchedule, loanSummary } from "@/lib/accountingEngine";
import { inr, todayISO } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, LoaderCircle, UserRound } from "lucide-react";
import { suggestTransaction } from "@/lib/suggestions.functions";
import type { TransactionSuggestion } from "@/lib/transactionSuggestion";

type Draft = Partial<Transaction> & { type: TxType };

const blank = (accountId = ""): Draft => ({
  type: "Daily Expense", date: todayISO(), amount: 0, accountId, paymentMethod: "UPI", mainCategory: "", subCategory: "", description: "", source: "Manual",
});

export function TransactionDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Partial<Transaction> }) {
  const db = useDB();
  const today = todayISO();
  const [d, setD] = useState<Draft>(blank());
  const suggest = useServerFn(suggestTransaction);
  const [suggestion, setSuggestion] = useState<TransactionSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  useEffect(() => { if (open) { setSuggestion(null); setSuggestionError(""); } }, [open]);
  async function getSuggestion() {
    setSuggesting(true); setSuggestion(null); setSuggestionError("");
    try {
      const result = await suggest({ data: { description: d.description ?? "", config: { ...db.config, people: [] } } });
      if (result.error) setSuggestionError(result.error);
      else setSuggestion(result.suggestion);
    } catch { setSuggestionError("AI suggestions are unavailable. Your entry has not changed."); }
    finally { setSuggesting(false); }
  }
  function applySuggestion() {
    if (!suggestion) return;
    const tags = Object.fromEntries(Object.entries(suggestion).map(([k, v]) => [k, v ?? undefined]));
    set({ ...tags, relatedBorrowingId: undefined, relatedLendingId: undefined, relatedEmiId: undefined } as Partial<Draft>);
    setSuggestion(null);
  }
  useEffect(() => { if (open) setD({ ...blank(db.accounts[0]?.id), ...initial } as Draft); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = txMeta(d.type);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const isExpense = meta.nature === "EXPENSE" || meta.nature === "REFUND";
  const isTransfer = meta.dir === "TRANSFER";
  const cats = isExpense ? Object.keys(db.config.expenseCategories) : meta.nature === "INCOME" ? db.config.incomeCategories : [];
  const subs = isExpense && d.mainCategory ? db.config.expenseCategories[d.mainCategory] ?? [] : [];
  const account = db.accounts.find((a) => a.id === d.accountId);
  const methods = methodsForAccount(account);
  const people = db.config.people;
  const isLoanInterest = d.type === "Interest Paid on Borrowing" || d.type === "Interest Received from Money Lent";
  const linkedLoan = useMemo(() => [...db.borrowings, ...db.lendings].find((l) => l.loanId === (d.relatedBorrowingId ?? d.relatedLendingId)),
    [db.borrowings, db.lendings, d.relatedBorrowingId, d.relatedLendingId]);

  // Account change may invalidate the chosen method.
  useEffect(() => { if (d.paymentMethod && methods.length && !methods.includes(d.paymentMethod)) set({ paymentMethod: methods[0] }); }, [methods, d.paymentMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loan-linked interest entries pick up the shared description template.
  useEffect(() => {
    if (isLoanInterest && linkedLoan && !d.id) {
      const period = periodForInterestDate(linkedLoan, db.transactions, d.date ?? today);
      set({ description: loanInterestDescription(linkedLoan, period), loanPeriod: period });
    }
  }, [isLoanInterest, linkedLoan, d.id, d.date, db.transactions, d.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const loanList = useMemo(() => {
    const b = db.borrowings.map((l) => ({ id: l.loanId, kind: "borrowing" as const, label: `${l.loanId} · ${l.counterparty}`, person: l.counterparty }));
    const e = db.emiLoans.map((l) => ({ id: l.loanId, kind: "emi" as const, label: `${l.loanId} · ${l.lender} (${l.loanType} EMI)`, person: l.lender }));
    if (meta.link === "borrowing") return b;
    if (meta.link === "emi") return e;
    if (meta.link === "borrowing_or_emi") return [...b, ...e];
    return [];
  }, [meta.link, db]);
  const selectedLoan = d.relatedBorrowingId ?? d.relatedLendingId ?? d.relatedEmiId ?? "";

  const context = useMemo(() => {
    const pl = [...db.borrowings, ...db.lendings].find((l) => l.loanId === selectedLoan);
    if (pl) {
      const s = loanSummary(pl, db.transactions.filter((t) => t.id !== d.id), today);
      return { outstanding: s.outstanding, interestDue: s.unpaidInterest, next: undefined as { n: number; emi: number } | undefined };
    }
    const el = db.emiLoans.find((l) => l.loanId === selectedLoan);
    if (el) {
      const s = emiSchedule(el, db.transactions.filter((t) => t.id !== d.id));
      return { outstanding: s.outstanding, interestDue: undefined as number | undefined, next: s.next };
    }
    return null;
  }, [selectedLoan, db, d.id, today]);

  function pickLoan(id: string) {
    const item = loanList.find((x) => x.id === id);
    const p: Partial<Draft> = { relatedBorrowingId: undefined, relatedLendingId: undefined, relatedEmiId: undefined, relatedPerson: item?.person };
    if (item?.kind === "borrowing") p.relatedBorrowingId = id;
    if (item?.kind === "lending") p.relatedLendingId = id;
    if (item?.kind === "emi") p.relatedEmiId = id;
    // auto-fill expected amount
    const pl = [...db.borrowings, ...db.lendings].find((l) => l.loanId === id);
    if (pl && d.type.startsWith("Interest")) {
      const s = loanSummary(pl, db.transactions, today);
      const period = periodForInterestDate(pl, db.transactions, d.date ?? today);
      p.amount = s.nextDue?.balancePayableOrReceivable ?? 0;
      p.description = loanInterestDescription(pl, period);
      p.loanPeriod = period;
    }
    const el = db.emiLoans.find((l) => l.loanId === id);
    if (el && d.type === "EMI Payment") {
      const s = emiSchedule(el, db.transactions);
      if (s.next) { p.amount = s.next.emi; p.interestComponent = s.next.interest; p.principalComponent = s.next.principal; p.date = s.next.dueDate; p.description = `EMI ${s.next.n} · ${el.lender}`; }
    }
    p.mainCategory = d.type.includes("Interest") ? "Interest" : d.type === "EMI Payment" ? "EMI" : "Loans";
    set(p);
  }

  const addPerson = () => {
    const name = newPerson.trim();
    if (!name) return;
    if (!people.some((p) => p.toLowerCase() === name.toLowerCase())) upsertConfigPeople([...people, name]);
    set({ relatedPerson: name });
    setNewPerson("");
  };
  const upsertConfigPeople = (list: string[]) => setDB((db0) => ({ ...db0, config: { ...db0.config, people: list } }));
  const mergePeople = () => {
    if (!mergeFrom || !mergeInto || mergeFrom === mergeInto) return toast.error("Pick two different people");
    setDB((db0) => ({
      ...db0,
      transactions: db0.transactions.map((t) => (t.relatedPerson === mergeFrom ? { ...t, relatedPerson: mergeInto } : t)),
      borrowings: db0.borrowings.map((l) => (l.counterparty === mergeFrom ? { ...l, counterparty: mergeInto } : l)),
      lendings: db0.lendings.map((l) => (l.counterparty === mergeFrom ? { ...l, counterparty: mergeInto } : l)),
      emiLoans: db0.emiLoans.map((l) => (l.lender === mergeFrom ? { ...l, lender: mergeInto } : l)),
      config: { ...db0.config, people: db0.config.people.filter((p) => p !== mergeFrom) },
    }));
    set({ relatedPerson: d.relatedPerson === mergeFrom ? mergeInto : d.relatedPerson });
    setMergeOpen(false); setMergeFrom(""); setMergeInto("");
    toast.success(`Merged into ${mergeInto}`);
  };

  function save() {
    const amt = Number(d.amount);
    if (!d.date || !d.accountId || !(amt > 0)) return toast.error("Date, account and a positive amount are required");
    if (meta.dir === "TRANSFER" && (!d.toAccountId || d.toAccountId === d.accountId)) return toast.error("Pick a different destination account");
    if (meta.link && meta.link !== "asset" && !selectedLoan) return toast.error("Select the linked loan");
    if (d.type === "EMI Payment") {
      const sum = Number(d.interestComponent ?? 0) + Number(d.principalComponent ?? 0);
      if (Math.abs(sum - amt) > 1) return toast.error(`Interest + principal (${inr(sum)}) must equal EMI amount`);
    }
    if ((d.type === "Principal Repayment on Borrowing" || d.type === "Principal Received from Borrower") && context && amt > context.outstanding + 0.5)
      return toast.error(`Exceeds outstanding principal ${inr(context.outstanding)}`);
    const tx = {
      ...d, id: d.id ?? uid("TX"), amount: amt, description: d.description || d.type,
      interestComponent: d.type === "EMI Payment" ? Number(d.interestComponent) : undefined,
      principalComponent: d.type === "EMI Payment" ? Number(d.principalComponent) : undefined,
      toAccountId: meta.dir === "TRANSFER" ? d.toAccountId : undefined,
      source: isLoanInterest && !d.id ? "Loan schedule" : d.source ?? "Manual",
    } as Transaction;
    saveTx(tx);
    toast.success(selectedLoan ? `Saved · ledger for ${selectedLoan} and account balance updated` : "Transaction saved");
    onOpenChange(false);
  }

  const effect = { INCOME: "Counts as income", EXPENSE: "Counts as expense", LIABILITY: "Changes loan principal only — not income/expense", ASSET: "Converts cash to asset/receivable — not income/expense", EMI: "Interest part = expense, principal part reduces loan", NEUTRAL: "Zero impact on income & expense", REFUND: "Offsets spending in its category" }[meta.nature];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{d.id ? "Edit transaction" : "New transaction"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-b pb-4 sm:col-span-2">
            <Field label="Transaction description"><Input value={d.description ?? ""} placeholder="e.g. Paid ₹1,200 for office internet" onChange={(e) => { set({ description: e.target.value }); setSuggestion(null); }} /></Field>
            <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">AI-powered suggestions</span><Button variant="secondary" size="sm" disabled={suggesting || (d.description?.trim().length ?? 0) < 3} onClick={getSuggestion}>{suggesting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{suggesting ? "Suggesting…" : "Suggest details"}</Button></div>
            {suggestionError && <p role="alert" className="mt-2 text-xs text-destructive">{suggestionError}</p>}
            {suggestion && <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3"><div className="text-xs font-semibold">{suggestion.type} · {suggestion.mainCategory || "Uncategorised"}</div><div className="mt-2 flex flex-wrap gap-1">{[suggestion.personalOrBusiness, suggestion.essentialOrDiscretionary, suggestion.needOrWant, suggestion.recurringOrOneTime, suggestion.fixedOrVariable].filter(Boolean).map((t) => <span key={t} className="rounded-full bg-muted px-2 py-1 text-[10px]">{t}</span>)}</div><Button size="sm" className="mt-3" onClick={applySuggestion}>Apply suggestion</Button></div>}
          </div>
          <Field label="Type" className="sm:col-span-2">
            <Select value={d.type} onChange={(e) => set({ type: e.target.value as TxType, relatedBorrowingId: undefined, relatedLendingId: undefined, relatedEmiId: undefined, mainCategory: "", subCategory: "" })}>
              {TX_TYPES.map((t) => <option key={t.type}>{t.type}</option>)}
            </Select>
            <span className="mt-1 block text-xs text-primary">{effect}</span>
          </Field>

          {loanList.length > 0 || meta.link ? (
            meta.link !== "asset" && (
              <Field label="Loan ID" className="sm:col-span-2">
                <Select value={selectedLoan} onChange={(e) => pickLoan(e.target.value)}>
                  <option value="">Select loan…</option>
                  {loanList.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
                {context && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Outstanding principal <b className="num text-foreground">{inr(context.outstanding)}</b>
                    {"interestDue" in context && context.interestDue !== undefined && <> · Unpaid interest <b className="num text-warning">{inr(context.interestDue)}</b></>}
                    {"next" in context && context.next && <> · Next EMI #{context.next.n} <b className="num text-foreground">{inr(context.next.emi)}</b></>}
                  </span>
                )}
              </Field>
            )
          ) : null}

          <Field label="Date"><Input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Amount (₹)"><Input type="number" inputMode="decimal" value={d.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>

          {d.type === "EMI Payment" && (
            <>
              <Field label="Interest component (expense)"><Input type="number" value={d.interestComponent ?? ""} onChange={(e) => set({ interestComponent: Number(e.target.value) })} /></Field>
              <Field label="Principal component (reduces loan)"><Input type="number" value={d.principalComponent ?? ""} onChange={(e) => set({ principalComponent: Number(e.target.value) })} /></Field>
            </>
          )}

          <Field label={isTransfer ? "From account" : "Account"}>
            <Select value={d.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              <option value="">Select…</option>
              {db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          {isTransfer ? (
            <Field label="To account">
              <Select value={d.toAccountId ?? ""} onChange={(e) => set({ toAccountId: e.target.value })}>
                <option value="">Select…</option>
                {db.accounts.filter((a) => a.id !== d.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Payment method">
              <Select value={d.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
                {(methods.length ? methods : db.config.paymentMethods).map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
          )}

          {cats.length > 0 && (
            <>
              <Field label="Main category">
                <Select value={d.mainCategory} onChange={(e) => set({ mainCategory: e.target.value, subCategory: "" })}>
                  <option value="">Select…</option>{cats.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Sub category">
                <Select value={d.subCategory} onChange={(e) => set({ subCategory: e.target.value })} disabled={!subs.length}>
                  <option value="">—</option>{subs.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            </>
          )}

          {!isTransfer && (
            <Field label="Related person">
              <div className="flex gap-2">
                <Select value={people.includes(d.relatedPerson ?? "") ? d.relatedPerson : ""} onChange={(e) => set({ relatedPerson: e.target.value || undefined })}>
                  <option value="">—</option>{people.map((p) => <option key={p}>{p}</option>)}
                </Select>
                <Input value={newPerson} placeholder="Add new" onChange={(e) => setNewPerson(e.target.value)} onBlur={addPerson} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }} />
              </div>
              <button type="button" onClick={() => setMergeOpen(true)} className="mt-1 text-left text-[11px] text-muted-foreground underline underline-offset-2">Merge duplicate people…</button>
            </Field>
          )}
          <Field label="Reference (UTR / receipt)"><Input value={d.referenceNumber ?? ""} onChange={(e) => set({ referenceNumber: e.target.value })} /></Field>

          {isExpense && (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-5">
              {([
                ["essentialOrDiscretionary", ["Essential", "Discretionary"]],
                ["needOrWant", ["Need", "Want"]],
                ["recurringOrOneTime", ["Recurring", "One-time"]],
                ["personalOrBusiness", ["Personal", "Business"]],
                ["fixedOrVariable", ["Fixed", "Variable"]],
              ] as const).map(([k, opts]) => (
                <Field key={k} label={opts.join(" / ")}>
                  <Select value={(d[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value || undefined } as Partial<Draft>)}>
                    <option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          )}
          <Field label="Notes" className="sm:col-span-2"><Input value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save transaction</Button>
        </div>

        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><UserRound className="size-4" /> Merge duplicate people</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">All transactions and loans will move to the person you keep.</p>
            <Field label="Merge from"><Select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}><option value="">Select…</option>{people.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Keep"><Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}><option value="">Select…</option>{people.filter((p) => p !== mergeFrom).map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setMergeOpen(false)}>Cancel</Button><Button onClick={mergePeople}>Merge</Button></div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
