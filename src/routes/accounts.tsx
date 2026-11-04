import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useDB, upsert, removeItem, uid } from "@/lib/store";
import { accountStatement } from "@/lib/accountingEngine";
import { inr, todayISO } from "@/lib/format";
import { ACCOUNT_TYPES, type Account } from "@/lib/types";
import { Badge, Field, Input, PageHeader, Panel, Select, Stat } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Bank & Cash Accounts — Kanakku" },
      { name: "description", content: "Live bank, cash and wallet balances with statement reconciliation." },
      { property: "og:title", content: "Bank & Cash Accounts — Kanakku" },
      { property: "og:description", content: "Opening + inflows − outflows ± transfers = closing, reconciled against your bank statement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Accounts,
});

function Accounts() {
  const db = useDB();
  const [form, setForm] = useState<{ name: string; type: Account["type"]; opening: string }>({ name: "", type: "Savings", opening: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const stmts = db.accounts.map((a) => ({ a, s: accountStatement(a, db.transactions) }));
  const total = stmts.reduce((x, y) => x + y.s.closing, 0);
  const unexplained = stmts.reduce((x, y) => x + Math.abs(y.s.variance ?? 0), 0);

  return (
    <div>
      <PageHeader title="Bank accounts & cash" subtitle="Balances are calculated from the register — never typed in." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total cash & bank" value={inr(total)} tone="brand" />
        <Stat label="Accounts" value={String(db.accounts.length)} />
        <Stat label="Unexplained variance" value={inr(unexplained)} tone={unexplained ? "bad" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {stmts.map(({ a, s }) => {
          const matched = s.variance !== undefined && Math.abs(s.variance) < 1;
          return (
            <Panel key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold">{a.name}<Button variant="ghost" size="icon" aria-label={`Edit account ${a.name}`} onClick={() => {setEditing(a.id);setForm({name:a.name,type:a.type,opening:String(a.openingBalance)});}}><Pencil className="size-3" /></Button></div>
                  <div className="text-xs text-muted-foreground">{a.type}</div>
                </div>
                <div className="text-right">
                  <div className="num text-xl font-bold">{inr(s.closing)}</div>
                  <div className="text-[11px] text-muted-foreground">Calculated closing</div>
                </div>
              </div>
              <div className="num mt-4 space-y-1.5 text-sm">
                <Row l="Opening balance" v={inr(s.opening)} />
                <Row l="+ Inflows" v={inr(s.inflows)} c="text-success" />
                <Row l="− Outflows" v={inr(s.outflows)} c="text-destructive" />
                <Row l="+ Transfers in" v={inr(s.transferIn)} c="text-info" />
                <Row l="− Transfers out" v={inr(s.transferOut)} c="text-info" />
                <div className="border-t pt-1.5"><Row l="= Closing balance" v={inr(s.closing)} c="font-bold" /></div>
              </div>
              <div className="mt-4 rounded-lg bg-surface p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  Statement reconciliation
                  {s.variance !== undefined && <Badge>{matched ? "Matched" : "Mismatch"}</Badge>}
                </div>
                <div className="flex items-end gap-2">
                  <Field label="Bank statement balance (₹)" className="flex-1">
                    <Input type="number" defaultValue={a.statementBalance ?? ""} onBlur={(e) => upsert("accounts", { ...a, statementBalance: e.target.value === "" ? undefined : Number(e.target.value), statementDate: todayISO() })} />
                  </Field>
                  <button aria-label="Delete account" className="mb-2 p-1 text-muted-foreground hover:text-destructive" onClick={() => {
                    if (db.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id)) return alert("Account has transactions — delete them first.");
                    removeItem("accounts", a.id);
                  }}><Trash2 className="size-4" /></button>
                </div>
                {s.variance !== undefined && !matched && (
                  <p className="mt-2 text-xs text-destructive">Unexplained discrepancy of <b className="num">{inr(s.variance)}</b> — {s.variance > 0 ? "bank shows more; a credit may be unrecorded" : "bank shows less; a debit/charge may be unrecorded"}.</p>
                )}
              </div>
            </Panel>
          );
        })}

        <Panel title={editing ? "Edit account" : "Add account"}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SBI Savings" /></Field>
            <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })}>{ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Opening balance (₹)"><Input type="number" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} /></Field>
          </div>
          <Button className="mt-3" disabled={!form.name.trim() || !Number.isFinite(Number(form.opening))} onClick={() => { const old=db.accounts.find(a=>a.id===editing);upsert("accounts", { ...old, id: editing??uid("ACC"), name: form.name.trim(), type: form.type, openingBalance: Number(form.opening) || 0 });setEditing(null); setForm({ name: "", type: "Savings", opening: "" }); }}><Plus /> {editing?"Save account":"Add account"}</Button>
          {editing && <Button variant="ghost" className="mt-3" onClick={()=>{setEditing(null);setForm({name:"",type:"Savings",opening:""});}}>Cancel</Button>}
        </Panel>
      </div>
    </div>
  );
}

const Row = ({ l, v, c = "" }: { l: string; v: string; c?: string }) => (
  <div className="flex justify-between"><span className="font-sans text-muted-foreground">{l}</span><span className={c}>{v}</span></div>
);
