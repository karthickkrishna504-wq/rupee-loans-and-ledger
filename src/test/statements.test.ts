import {describe,it,expect} from "vitest";
import {buildSeed} from "@/lib/seed";
import {annualStatements,ANNUAL_METRICS,monthlyStatement,budgetStatement,commitmentStatement} from "@/lib/accountingEngine";
import {runAccountingAudit} from "@/lib/accountingAudit";
import {buildWorkbook,readWorkbook,validateBackup} from "@/lib/workbook";
import * as XLSX from "xlsx";
describe("financial statements and backups",()=>{
 it("cash flow reconciles operating and capital movements",()=>{const db=buildSeed();const s=monthlyStatement(db,"2026-04");expect(s.borrowed).toBe(1100000);expect(s.transfers).toBe(13000);expect(s.opening+s.operating+s.financing).toBeCloseTo(s.closing);});
 it("annual summary contains 20 metrics and April to March",()=>{const rows=annualStatements(buildSeed(),2026);expect(ANNUAL_METRICS).toHaveLength(20);expect(rows[0].month).toBe("2026-04");expect(rows[11].month).toBe("2027-03");});
 it("budget variance derives from expenses",()=>{const db=buildSeed();const b=budgetStatement(db,"2026-04").find(x=>x.category==="Food");expect(b?.actual).toBe(10600);expect(b?.variance).toBe(1400);});
 it("commitments use 7-day horizon and recurring rent",()=>{const db=buildSeed();db.obligations=[{id:"rent",name:"Rent",amount:25000,dueDay:3}];const rows=commitmentStatement(db,"2026-11-01",7);expect(rows.find(r=>r.id==="rent-2026-11-03")?.amount).toBe(25000);expect(rows.every(r=>r.date<="2026-11-08")).toBe(true);});
 it("executes exactly nine passing audit scenarios",()=>{const audit=runAccountingAudit();expect(audit).toHaveLength(9);expect(audit.filter(x=>!x.pass)).toEqual([]);});
 it("round-trips a full 15-sheet workbook with nested configuration and overrides",()=>{const db=buildSeed();db.emiLoans[0].overrides={1:{interest:5500,principal:14143}};const wb=buildWorkbook(db,"2026-10-31");expect(wb.SheetNames).toHaveLength(15);const bytes=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});const restored=readWorkbook(XLSX.read(bytes,{type:"buffer"}));expect(restored.transactions).toEqual(db.transactions);expect(restored.config).toEqual(db.config);expect(restored.emiLoans).toEqual(db.emiLoans);});
 it("rejects malformed backup before replacement",()=>{expect(()=>validateBackup({accounts:[]})).toThrow();});
});