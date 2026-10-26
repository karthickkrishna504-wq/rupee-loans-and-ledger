import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useDB, removeItem } from "@/lib/store";
import { filterByPeriod, summarize } from "@/lib/accountingEngine";
import { fmtDate, fyLabel, fyStart, inr, monthKey, monthLabel } from "@/lib/format";
import { TX_TYPES, type Transaction } from "@/lib/types";
import { Badge, Input, PageHeader, Select, Stat, Table } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/fin/TransactionDialog";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transaction Register — Khata ERP" },
      { name: "description", content: "Searchable daily register of every rupee in and out, with smart loan-linked entries." },
      { property: "og:title", content: "Transaction Register — Khata ERP" },
      { property: "og:description", content: "Master daily transaction register with 22 strict transaction types." },
    ],
  }),
  component: Register,
});

const QUICK = [
  { k: "ALL", l: "All" }, { k: "INCOME", l: "Income" }, { k: "EXPENSE", l: "Expenses" }, { k: "LOANS", l: "Loans & interest" }, { k: "TRANSFER", l: "Transfers" },
];

function Register() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [acc, setAcc] = useState("");
  const [period, setPeriod] = useState("ALL");
  const [quick, setQuick] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Transaction | undefined>();
  const name = (id?: string) => db.accounts.find((a) => a.id === id)?.name ?? "—";

  const months = useMemo(() => [...new Set(db.transactions.map((t) => monthKey(t.date)))].sort().reverse(), [db.transactions]);
  const fys = useMemo(() => [...new Set(db.transactions.map((t) => fyStart(t.date)))].sort().reverse(), [db.transactions]);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return filterByPeriod(db.transactions, period)
      .filter((t) => !type || t.type === type)
      .filter((t) => !acc || t.accountId === acc || t.toAccountId === acc)
      .filter((t) => {
        if (quick === "INCOME") return t.type.includes("Income") || t.type === "Interest Received from Money Lent";
        if (quick === "EXPENSE") return t.type.includes("Expense") || t.type === "Interest Paid on Borrowing" || t.type === "EMI Payment";
        if (quick === "LOANS") return !!(t.relatedBorrowingId || t.relatedLendingId || t.relatedEmiId);
        if (quick === "TRANSFER") return t.direction === "TRANSFER";
        return true;
      })
      .filter((t) => !s || [t.description, t.relatedPerson, t.mainCategory, t.subCategory, t.referenceNumber, t.type, t.notes].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [db.transactions, q, type, acc, period, quick]);
  const sum = summarize(rows);

  return (
    <div>
      <PageHeader title="Daily transaction register" subtitle={`${rows.length} of ${db.transactions.length} entries`}
        actions={<Button onClick={() => { setEdit(undefined); setOpen(true); }}><Plus /> New entry</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Income (filtered)" value={inr(sum.income)} tone="good" />
        <Stat label="Expense (filtered)" value={inr(sum.expense)} tone="bad" />
        <Stat label="Cash in" value={inr(sum.inflow)} />
        <Stat label="Cash out" value={inr(sum.outflow)} />
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {QUICK.map((x) => (
          <button key={x.k} onClick={() => setQuick(x.k)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${quick === x.k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{x.l}</button>
        ))}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Search description, person, UTR…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TX_TYPES.map((t) => <option key={t.type}>{t.type}</option>)}</Select>
        <Select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">All accounts</option>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="ALL">All periods</option>
          <optgroup label="Financial year">{fys.map((y) => <option key={y} value={`FY:${y}`}>{fyLabel(y)}</option>)}</optgroup>
          <optgroup label="Month">{months.map((m) => <option key={m} value={`M:${m}`}>{monthLabel(m)}</option>)}</optgroup>
        </Select>
      </div>

      <Table empty={!rows.length} head={["", "ID", "Date", "Month", "FY", "Type", "Dir", "Amount", "Category", "Sub-category", "Description", "Account", "To account", "Method", "Person", "Loan / EMI", "EMI split (I / P)", "Essential?", "Need/Want", "Recurring?", "Pers/Biz", "Fixed/Var", "Reference", "Source", "Notes"]}>
        {rows.map((t) => (
          <tr key={t.id}>
            <td>
              <div className="flex gap-1">
                <button aria-label="Edit" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => { setEdit(t); setOpen(true); }}><Pencil className="size-3.5" /></button>
                <button aria-label="Delete" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => confirm("Delete this transaction?") && removeItem("transactions", t.id)}><Trash2 className="size-3.5" /></button>
              </div>
            </td>
            <td className="num text-xs text-muted-foreground">{t.id}</td>
            <td className="num">{fmtDate(t.date)}</td>
            <td>{t.month}</td>
            <td className="text-xs">{t.financialYear}</td>
            <td className="font-medium">{t.type}</td>
            <td><Badge>{t.direction}</Badge></td>
            <td className={`num text-right font-semibold ${t.direction === "IN" ? "text-success" : t.direction === "OUT" ? "text-destructive" : "text-info"}`}>{t.direction === "OUT" ? "−" : t.direction === "IN" ? "+" : "⇄ "}{inr(t.amount)}</td>
            <td>{t.mainCategory || "—"}</td>
            <td>{t.subCategory || "—"}</td>
            <td className="max-w-64 truncate">{t.description}</td>
            <td>{name(t.accountId)}</td>
            <td>{t.toAccountId ? name(t.toAccountId) : "—"}</td>
            <td>{t.paymentMethod}</td>
            <td>{t.relatedPerson || "—"}</td>
            <td className="num text-xs">{t.relatedBorrowingId || t.relatedLendingId || t.relatedEmiId || t.relatedAssetId || "—"}</td>
            <td className="num text-xs">{t.type === "EMI Payment" ? `${inr(t.interestComponent ?? 0)} / ${inr(t.principalComponent ?? 0)}` : "—"}</td>
            <td>{t.essentialOrDiscretionary ?? "—"}</td>
            <td>{t.needOrWant ?? "—"}</td>
            <td>{t.recurringOrOneTime ?? "—"}</td>
            <td>{t.personalOrBusiness ?? "—"}</td>
            <td>{t.fixedOrVariable ?? "—"}</td>
            <td className="num text-xs">{t.referenceNumber || "—"}</td>
            <td className="text-xs">{t.source}</td>
            <td className="max-w-48 truncate text-xs text-muted-foreground">{t.notes || ""}</td>
          </tr>
        ))}
      </Table>
      <TransactionDialog open={open} onOpenChange={setOpen} initial={edit} />
    </div>
  );
}
