import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Database, Download, Trash2, Upload, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { useDB, setDB, loadValidationData, clearAll, emptyDB } from "@/lib/store";
import { fmtDate, todayISO } from "@/lib/format";
import { PageHeader, Panel, Input } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Backup — Khata ERP" },
      { name: "description", content: "Validation data loader, JSON/Excel backups and editable categories." },
      { property: "og:title", content: "Settings & Backup — Khata ERP" },
      { property: "og:description", content: "Manage data, backups and master configuration." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const db = useDB();
  const file = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState("");

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `khata-backup-${fmtDate(todayISO())}.json`;
    a.click();
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    (["transactions", "accounts", "borrowings", "lendings", "emiLoans", "budgets", "assets", "goals"] as const).forEach((k) => {
      const rows = (db[k] as unknown as Record<string, unknown>[]).map((r) => ({ ...r, ...("date" in r ? { date: fmtDate(r.date as string) } : {}) }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), k);
    });
    XLSX.writeFile(wb, `khata-backup-${fmtDate(todayISO())}.xlsx`);
  };
  const importJson = async (f: File) => {
    try { setDB({ ...emptyDB(), ...JSON.parse(await f.text()) }); toast.success("Backup restored"); }
    catch { toast.error("That file isn't a valid backup"); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" subtitle="Everything is saved on this device automatically." />
      <Panel title="Validation test data">
        <p className="mb-3 text-sm text-muted-foreground">Loads ₹5,00,000 borrowed @ 2%/month, ₹2,00,000 lent @ 2%/month, a ₹6,00,000 personal EMI loan, salary, expenses and transfers for FY 2026-27.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { loadValidationData(); toast.success("Validation data loaded"); }}><Database /> Load validation data</Button>
          <Button variant="destructive" onClick={() => { if (confirm("Delete ALL data on this device?")) { clearAll(); toast.success("All data cleared"); } }}><Trash2 /> Clear all data</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{db.transactions.length} transactions · {db.accounts.length} accounts · {db.borrowings.length + db.lendings.length + db.emiLoans.length} loans</p>
      </Panel>
      <Panel title="Backup & restore">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJson}><Download /> Export JSON</Button>
          <Button variant="outline" onClick={exportXlsx}><FileSpreadsheet /> Export Excel</Button>
          <Button variant="outline" onClick={() => file.current?.click()}><Upload /> Restore JSON</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </Panel>
      <Panel title="Expense categories">
        <div className="flex flex-wrap gap-2">
          {Object.keys(db.config.expenseCategories).map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
              {c}
              <button aria-label={`Remove ${c}`} onClick={() => setDB((d) => { const ec = { ...d.config.expenseCategories }; delete ec[c]; return { ...d, config: { ...d.config, expenseCategories: ec } }; })}><X className="size-3" /></button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Button disabled={!newCat} onClick={() => { setDB((d) => ({ ...d, config: { ...d.config, expenseCategories: { ...d.config.expenseCategories, [newCat]: [] } } })); setNewCat(""); }}>Add</Button>
        </div>
      </Panel>
    </div>
  );
}
