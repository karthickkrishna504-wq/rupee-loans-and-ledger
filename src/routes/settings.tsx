import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Database, Download, Trash2, Upload, FileSpreadsheet, X, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useDB, setDB, loadValidationData, clearAll } from "@/lib/store";
import { fmtDate, todayISO } from "@/lib/format";
import { PageHeader, Panel, Input, Field, Select, Badge } from "@/components/fin/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { exportFullWorkbook, readWorkbook, validateBackup } from "@/lib/workbook";
import { runAccountingAudit } from "@/lib/accountingAudit";
import type { DB, MasterConfig } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Backup — Kanakku" },
      { name: "description", content: "Validation data loader, JSON/Excel backups and editable categories." },
      { property: "og:title", content: "Settings & Backup — Kanakku" },
      { property: "og:description", content: "Manage data, backups and master configuration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const db = useDB();
  const file = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState("");
  const [restore, setRestore] = useState<DB | null>(null);
  const [audit, setAudit] = useState<ReturnType<typeof runAccountingAudit> | null>(null);
  const [subCat, setSubCat] = useState("");
  const [selectedCat, setSelectedCat] = useState("");
  const [listValue, setListValue] = useState<Record<string,string>>({});

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `khata-backup-${fmtDate(todayISO())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importBackup = async (f: File) => {
    try {
      if (/\.json$/i.test(f.name)) setRestore(validateBackup(JSON.parse(await f.text())));
      else { const XLSX = await import("xlsx"); setRestore(readWorkbook(XLSX.read(await f.arrayBuffer(), { type: "array" }))); }
    } catch(e) { toast.error(e instanceof Error ? `Backup rejected: ${e.message.slice(0,180)}` : "That file isn't a valid backup"); }
    finally { if(file.current)file.current.value=""; }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" subtitle="Everything is saved on this device automatically." />
      <Panel title="Validation test data">
        <p className="mb-3 text-sm text-muted-foreground">Loads ₹5,00,000 borrowed @ 2%/month, ₹2,00,000 lent @ 2%/month, a ₹6,00,000 personal EMI loan, salary, expenses and transfers for FY 2026-27.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { if(confirm("Replace all current data with validation data? Export a backup first.")){loadValidationData(); toast.success("Validation data loaded");} }}><Database /> Load validation data</Button>
          <Button variant="secondary" onClick={() => setAudit(runAccountingAudit())}><ShieldCheck /> Run 9 accounting validation tests</Button>
          <Button variant="destructive" onClick={() => { if (confirm("Delete ALL data on this device?")) { clearAll(); toast.success("All data cleared"); } }}><Trash2 /> Clear all data</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{db.transactions.length} transactions · {db.accounts.length} accounts · {db.borrowings.length + db.lendings.length + db.emiLoans.length} loans</p>
      </Panel>
      <Panel title="Backup & restore">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJson}><Download /> Export JSON</Button>
          <Button variant="outline" onClick={() => exportFullWorkbook(db)}><FileSpreadsheet /> Export full 15-sheet Excel workbook</Button>
          <Button variant="outline" onClick={() => file.current?.click()}><Upload /> Restore JSON / Excel</Button>
          <input ref={file} type="file" accept=".json,.xlsx,.xls" hidden onChange={(e) => { const f=e.target.files?.[0]; if(f)void importBackup(f); }} />
        </div>
      </Panel>
      <Panel title="Expense categories">
        <div className="flex flex-wrap gap-2">
          {Object.keys(db.config.expenseCategories).map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
              {c}
              <Button variant="ghost" size="icon" className="size-5" aria-label={`Remove ${c}`} onClick={() => setDB((d) => { const ec = { ...d.config.expenseCategories }; delete ec[c]; return { ...d, config: { ...d.config, expenseCategories: ec } }; })}><X className="size-3" /></Button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Button disabled={!newCat.trim()} onClick={() => { setDB((d) => ({ ...d, config: { ...d.config, expenseCategories: { ...d.config.expenseCategories, [newCat.trim()]: d.config.expenseCategories[newCat.trim()]??[] } } })); setNewCat(""); }}>Add</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Category sublist"><Select value={selectedCat} onChange={e=>setSelectedCat(e.target.value)}><option value="">Choose category</option>{Object.keys(db.config.expenseCategories).map(c=><option key={c}>{c}</option>)}</Select></Field><Field label="New subcategory"><div className="flex gap-2"><Input value={subCat} onChange={e=>setSubCat(e.target.value)} aria-label="New subcategory"/><Button disabled={!selectedCat||!subCat.trim()} onClick={()=>{setDB(d=>({...d,config:{...d.config,expenseCategories:{...d.config.expenseCategories,[selectedCat]:[...new Set([...(d.config.expenseCategories[selectedCat]??[]),subCat.trim()])]}}}));setSubCat("");}}>Add</Button></div></Field></div><div className="mt-2 flex flex-wrap gap-2">{(db.config.expenseCategories[selectedCat]??[]).map(s=><Button variant="outline" size="sm" key={s} onClick={()=>setDB(d=>({...d,config:{...d.config,expenseCategories:{...d.config.expenseCategories,[selectedCat]:d.config.expenseCategories[selectedCat].filter(x=>x!==s)}}}))}>{s}<X/></Button>)}</div>
      </Panel>
      {([["incomeCategories","Income categories"],["paymentMethods","Payment methods"],["people","People / lenders / borrowers"]] as const).map(([key,label])=><Panel title={label} key={key}><div className="flex flex-wrap gap-2">{db.config[key].map(v=><Button key={v} size="sm" variant="outline" aria-label={`Remove ${label} ${v}`} onClick={()=>setDB(d=>({...d,config:{...d.config,[key]:d.config[key].filter(x=>x!==v)} as MasterConfig}))}>{v}<X/></Button>)}</div><div className="mt-3 flex gap-2"><Input aria-label={`New ${label}`} value={listValue[key]??""} onChange={e=>setListValue({...listValue,[key]:e.target.value})}/><Button disabled={!listValue[key]?.trim()} onClick={()=>{setDB(d=>({...d,config:{...d.config,[key]:[...new Set([...d.config[key],listValue[key].trim()])]} as MasterConfig}));setListValue({...listValue,[key]:""});}}>Add</Button></div></Panel>)}
      <Dialog open={!!restore} onOpenChange={o=>{if(!o)setRestore(null);}}><DialogContent><DialogHeader><DialogTitle>Restore full backup?</DialogTitle><DialogDescription>This replaces all data on this device, including the bank inbox and merchant rules. Export your current backup first.</DialogDescription></DialogHeader><p className="text-sm">{restore?.accounts.length} accounts · {restore?.transactions.length} transactions · {(restore?.borrowings.length??0)+(restore?.lendings.length??0)+(restore?.emiLoans.length??0)} loans</p><Button variant="destructive" onClick={()=>{if(!restore)return;setDB(restore);setRestore(null);toast.success("Full backup restored");}}>Replace current data</Button></DialogContent></Dialog>
      <Dialog open={!!audit} onOpenChange={o=>{if(!o)setAudit(null);}}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Accounting validation audit</DialogTitle><DialogDescription>Isolated scenarios run through the same accounting engine. Your financial records are not modified.</DialogDescription></DialogHeader><Badge tone={audit?.every(r=>r.pass)?"good":"bad"}>{`${audit?.filter(r=>r.pass).length??0} / 9 passed`}</Badge>{audit?.map(r=><div key={r.name} className="flex gap-3 border-b pb-3">{r.pass?<CheckCircle2 className="size-5 shrink-0 text-success"/>:<XCircle className="size-5 shrink-0 text-destructive"/>}<div><p className="text-sm font-medium">{r.name}</p><p className="mt-1 break-all text-xs text-muted-foreground">Expected {JSON.stringify(r.expected)} · Actual {JSON.stringify(r.actual)}</p></div></div>)}</DialogContent></Dialog>
    </div>
  );
}
