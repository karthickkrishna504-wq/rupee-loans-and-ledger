import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useDB, removeItem, upsert } from "@/lib/store";
import { filterByPeriod, summarize } from "@/lib/accountingEngine";
import { addMonths, fmtDate, inr, monthKey, monthLabel, todayISO } from "@/lib/format";
import { TX_TYPES, type Transaction } from "@/lib/types";
import { Input, PageHeader, Select, Table } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TransactionDialog } from "@/components/fin/TransactionDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transaction Register — Kanakku" },
      { name: "description", content: "Searchable daily register of every rupee in and out, with smart loan-linked entries." },
      { property: "og:title", content: "Transaction Register — Kanakku" },
      { property: "og:description", content: "Master daily transaction register with 22 strict transaction types." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Register,
});

const QUICK = [
  { k: "ALL", l: "All" }, { k: "INCOME", l: "Income" }, { k: "EXPENSE", l: "Expenses" }, { k: "LOANS", l: "Loans & interest" }, { k: "TRANSFER", l: "Transfers" },
];
const PAGE = 50;

const DIR = {
  IN: { icon: ArrowDownLeft, cls: "text-success", sign: "+" },
  OUT: { icon: ArrowUpRight, cls: "text-destructive", sign: "−" },
  TRANSFER: { icon: ArrowLeftRight, cls: "text-info", sign: "" },
} as const;
const dirOf = (t: Transaction) => DIR[t.direction] ?? DIR.TRANSFER;

function Register() {
  const db = useDB();
  const today = todayISO();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [acc, setAcc] = useState("");
  const [quick, setQuick] = useState("ALL");
  const [mk, setMk] = useState(monthKey(today));
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Transaction | undefined>();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [confirming, setConfirming] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const name = (id?: string) => db.accounts.find((a) => a.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return filterByPeriod(db.transactions, `M:${mk}`)
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
  }, [db.transactions, q, type, acc, mk, quick]);
  const sum = summarize(rows);

  const visible = rows.slice(0, limit);
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visible) { const arr = map.get(t.date); if (arr) arr.push(t); else map.set(t.date, [t]); }
    return [...map.entries()];
  }, [visible]);

  useEffect(() => setLimit(PAGE), [q, type, acc, quick, mk]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => (l < rows.length ? l + PAGE : l)); }, { rootMargin: "480px" });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length]);

  const filters = [type && { k: "type", label: type }, acc && { k: "acc", label: name(acc) }].filter(Boolean) as { k: string; label: string }[];
  const active = filters.length + (quick !== "ALL" ? 1 : 0) + (q ? 1 : 0);

  const curMk = monthKey(today);
  const step = (n: number) => setMk(monthKey(addMonths(`${mk}-01`, n)));

  const del = (t: Transaction) => {
    removeItem("transactions", t.id);
    setConfirming(null);
    setSelected(null);
    toast("Transaction deleted", { action: { label: "Undo", onClick: () => upsert("transactions", t) } });
  };

  const txRows: [string, React.ReactNode][] = selected ? [
    ["Amount", `${dirOf(selected).sign}${inr(selected.amount)}`],
    ["Type", selected.type],
    ["Date", fmtDate(selected.date)],
    ["Category", [selected.mainCategory, selected.subCategory].filter(Boolean).join(" › ") || "—"],
    ["Account", selected.toAccountId ? `${name(selected.accountId)} → ${name(selected.toAccountId)}` : name(selected.accountId)],
    ["Method", selected.paymentMethod],
    ["Person", selected.relatedPerson || "—"],
    ["Loan / EMI", selected.relatedBorrowingId || selected.relatedLendingId || selected.relatedEmiId || selected.relatedAssetId || "—"],
    ["EMI split (I / P)", selected.type === "EMI Payment" ? `${inr(selected.interestComponent ?? 0)} / ${inr(selected.principalComponent ?? 0)}` : "—"],
    ["Reference", selected.referenceNumber || "—"],
    ["Source", selected.source],
    ["Notes", selected.notes || "—"],
  ] : [];

  return (
    <div>
      <PageHeader title="Daily transaction register" subtitle={`${rows.length} entries · ${monthLabel(mk)}`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="Income" value={inr(sum.income)} tone="text-success" />
        <SummaryCard label="Expenses" value={inr(sum.expense)} tone="text-destructive" />
        <SummaryCard label="Net" value={inr(sum.income - sum.expense)} tone={sum.income - sum.expense >= 0 ? "text-success" : "text-destructive"} />
        <SummaryCard label="Cash in" value={inr(sum.inflow)} tip="Income counts only income-type entries. Cash in also includes transfers between your own accounts and loan principal received, which are not income." />
        <SummaryCard label="Cash out" value={inr(sum.outflow)} tip="Expenses count only spending entries. Cash out also includes transfers between your own accounts and loan principal repaid, which are not expenses." />
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK.map((x) => (
          <button key={x.k} onClick={() => setQuick(x.k)} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150", quick === x.k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>{x.l}</button>
        ))}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search description, person, UTR…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-[var(--radius)] border bg-card px-1 sm:w-56">
          <button aria-label="Previous month" disabled={mk <= "0000-00"} onClick={() => step(-1)} className="pressable grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          <span className="text-center text-[13px] font-medium">{monthLabel(mk)}{mk === curMk && <span className="ml-1 text-[11px] text-muted-foreground">· current</span>}</span>
          <button aria-label="Next month" disabled={mk >= curMk} onClick={() => step(1)} className="pressable grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
        <Button variant="outline" onClick={() => setSheet(true)} className="relative">
          <SlidersHorizontal /> Filters
          {active > 0 && <span className="num absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{active}</span>}
        </Button>
      </div>

      {active > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {quick !== "ALL" && <Chip label={QUICK.find((x) => x.k === quick)!.l} onRemove={() => setQuick("ALL")} />}
          {q && <Chip label={`“${q}”`} onRemove={() => setQ("")} />}
          {filters.map((f) => <Chip key={f.k} label={f.label} onRemove={() => (f.k === "type" ? setType("") : setAcc(""))} />)}
        </div>
      )}

      {/* Mobile: date-grouped card list */}
      <div className="space-y-1 lg:hidden">
        {rows.length === 0 && <p className="panel p-8 text-center text-sm text-muted-foreground">No transactions match these filters this month.</p>}
        {groups.map(([date, items]) => (
          <div key={date}>
            <div className="sticky top-[104px] z-[5] -mx-1 bg-background/95 px-1 py-1.5 backdrop-blur">
              <span className="text-[12px] font-semibold text-muted-foreground">{fmtDate(date)}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const d = dirOf(t);
                return (
                  <button key={t.id} onClick={() => setSelected(t)} className="panel pressable grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--radius-card)] p-3.5 text-left">
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[15px] font-medium leading-snug">{t.description || t.type}</span>
                      <span className="mt-1 block truncate text-[12px] text-muted-foreground">{[t.mainCategory, name(t.accountId)].filter(Boolean).join(" · ") || t.type}</span>
                    </span>
                    <span className={cn("num flex items-center gap-1 whitespace-nowrap text-[15px] font-semibold", d.cls)}>
                      <d.icon className="size-4" />{d.sign}{inr(t.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full register, scrolls with the page */}
      <div className="hidden lg:block">
        <Table empty={!rows.length} head={["Date", "Description", "Amount", "Type", "Category", "Sub-category", "Account", "To account", "Method", "Person", "Loan / EMI", "EMI split (I / P)", "Essential?", "Need/Want", "Recurring?", "Pers/Biz", "Fixed/Var", "Reference", "Source", "Notes"]}>
          {rows.map((t) => {
            const d = dirOf(t);
            return (
              <tr key={t.id} className="cursor-pointer" onClick={() => setSelected(t)}>
                <td className="num whitespace-nowrap">{fmtDate(t.date)}</td>
                <td className="max-w-64 truncate font-medium">{t.description || <span className="text-muted-foreground">—</span>}</td>
                <td className={cn("num text-right font-semibold whitespace-nowrap", d.cls)}>{d.sign}{inr(t.amount)}</td>
                <td className="whitespace-nowrap">{t.type}</td>
                <td>{t.mainCategory || "—"}</td>
                <td>{t.subCategory || "—"}</td>
                <td>{name(t.accountId)}</td>
                <td>{t.toAccountId ? name(t.toAccountId) : "—"}</td>
                <td>{t.paymentMethod}</td>
                <td>{t.relatedPerson || "—"}</td>
                <td className="num text-xs text-muted-foreground">{t.relatedBorrowingId || t.relatedLendingId || t.relatedEmiId || t.relatedAssetId || "—"}</td>
                <td className="num text-xs">{t.type === "EMI Payment" ? `${inr(t.interestComponent ?? 0)} / ${inr(t.principalComponent ?? 0)}` : "—"}</td>
                <td>{t.essentialOrDiscretionary ?? "—"}</td>
                <td>{t.needOrWant ?? "—"}</td>
                <td>{t.recurringOrOneTime ?? "—"}</td>
                <td>{t.personalOrBusiness ?? "—"}</td>
                <td>{t.fixedOrVariable ?? "—"}</td>
                <td className="num text-xs text-muted-foreground">{t.referenceNumber || "—"}</td>
                <td className="text-xs text-muted-foreground">{t.source}</td>
                <td className="max-w-48 truncate text-xs text-muted-foreground">{t.notes || ""}</td>
              </tr>
            );
          })}
        </Table>
      </div>

      {limit < rows.length && (
        <div ref={sentinel} className="grid place-items-center py-4">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Load more ({rows.length - limit} remaining)</Button>
        </div>
      )}

      {/* Filters bottom sheet */}
      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent className="rounded-t-[var(--radius-card)] border-0 bg-card">
          <DrawerHeader className="text-left"><DrawerTitle className="text-[17px]">Filters</DrawerTitle><DrawerDescription>Narrow the register by type and account.</DrawerDescription></DrawerHeader>
          <div className="grid gap-3 px-5">
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Transaction type</span>
              <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TX_TYPES.map((t) => <option key={t.type}>{t.type}</option>)}</Select>
            </label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Account</span>
              <Select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">All accounts</option>{db.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            </label>
          </div>
          <DrawerFooter className="flex-row gap-2 px-5 pb-6">
            <button onClick={() => { setType(""); setAcc(""); }} className="pressable h-12 flex-1 rounded-[var(--radius)] bg-muted text-sm font-medium">Reset</button>
            <button onClick={() => setSheet(false)} className="pressable h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-medium text-primary-foreground">Show {rows.length} entries</button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Detail bottom sheet */}
      <Drawer open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DrawerContent className="rounded-t-[var(--radius-card)] border-0 bg-card">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-[17px]">{selected?.description || selected?.type}</DrawerTitle>
            <DrawerDescription>{selected && `${fmtDate(selected.date)} · ${dirOf(selected).sign}${inr(selected.amount)}`}</DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto px-5">
            {txRows.map(([l, v]) => (
              <div key={l} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 border-b py-2 text-sm last:border-0">
                <span className="text-muted-foreground">{l}</span><span className="break-words">{v}</span>
              </div>
            ))}
          </div>
          <DrawerFooter className="flex-row gap-2 px-5 pb-6">
            <Button variant="destructive" className="flex-1" onClick={() => setConfirming(selected)}><Trash2 /> Delete</Button>
            <Button className="flex-1" onClick={() => { setEdit(selected ?? undefined); setSelected(null); setOpen(true); }}><Pencil /> Edit</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete confirmation */}
      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>{confirming && `“${confirming.description || confirming.type}” of ${inr(confirming.amount)} on ${fmtDate(confirming.date)} will be removed and account balances updated. You can undo right after.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && del(confirming)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransactionDialog open={open} onOpenChange={setOpen} initial={edit} />
    </div>
  );
}

function SummaryCard({ label, value, tone, tip }: { label: string; value: string; tone?: string; tip?: string }) {
  return (
    <div className="panel p-3.5">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}{tip && <Info className="size-3.5 shrink-0 cursor-help" aria-label={tip} title={tip} />}</div>
      <div className={cn("num mt-1.5 text-lg font-semibold md:text-xl", tone)}>{value}</div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-medium text-accent-foreground">
      <span className="max-w-40 truncate">{label}</span>
      <button aria-label={`Remove filter ${label}`} onClick={onRemove} className="pressable grid size-4 place-items-center rounded-full hover:bg-foreground/10"><X className="size-3" /></button>
    </span>
  );
}
