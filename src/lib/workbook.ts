import * as XLSX from "xlsx";
import { z } from "zod";
import { annualStatements, interestLedger, principalMovements, emiSchedule } from "./accountingEngine";
import { TX_TYPES, type DB } from "./types";
import { fyStart, todayISO, fmtDate } from "./format";

const account=z.object({id:z.string(),name:z.string(),type:z.enum(["Savings","Current","Cash in Hand","Digital Wallet"]),openingBalance:z.number().finite()}).passthrough();
const transaction=z.object({id:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),type:z.string().refine(t=>TX_TYPES.some(x=>x.type===t)),amount:z.number().finite().positive(),accountId:z.string(),direction:z.enum(["IN","OUT","TRANSFER"]),description:z.string(),mainCategory:z.string(),subCategory:z.string(),paymentMethod:z.string(),source:z.enum(["Manual","Bank Import","Auto-Rule"]),month:z.number(),year:z.number(),financialYear:z.string()}).passthrough();
const privateLoan=z.object({loanId:z.string(),kind:z.enum(["BORROWED","LENT"]),counterparty:z.string(),originalPrincipal:z.number().nonnegative(),startDate:z.string(),annualInterestRate:z.number().nonnegative(),monthlyInterestRate:z.number().nonnegative(),calculationMethod:z.enum(["FIXED_MONTHLY_RATE","ANNUAL_DIV_12","DAILY_ACTUAL","MANUAL_AMOUNT"]),paymentFrequency:z.literal("Monthly"),interestDueDay:z.number().int().min(1).max(31)}).passthrough();
const schema=z.object({accounts:z.array(account),transactions:z.array(transaction),borrowings:z.array(privateLoan),lendings:z.array(privateLoan),emiLoans:z.array(z.object({loanId:z.string(),lender:z.string(),loanType:z.enum(["Home","Personal","Vehicle","Business","Education","Consumer"]),originalAmount:z.number().positive(),annualRate:z.number().nonnegative(),tenureMonths:z.number().int().positive(),disbursementDate:z.string(),emiStartDate:z.string(),emiDay:z.number().int().min(1).max(31),processingFee:z.number().nonnegative()}).passthrough()),budgets:z.array(z.object({id:z.string(),category:z.string(),monthlyLimit:z.number().nonnegative()}).passthrough()),assets:z.array(z.object({id:z.string(),name:z.string(),type:z.string(),currentValue:z.number().finite()}).passthrough()),obligations:z.array(z.object({id:z.string(),name:z.string(),amount:z.number().nonnegative(),dueDay:z.number().int().min(1).max(31)}).passthrough()),goals:z.array(z.object({id:z.string(),name:z.string(),target:z.number().positive(),saved:z.number().nonnegative()}).passthrough()),config:z.object({expenseCategories:z.record(z.array(z.string())),incomeCategories:z.array(z.string()),paymentMethods:z.array(z.string()),people:z.array(z.string())}),bankSync:z.object({rows:z.array(z.object({id:z.string(),fingerprint:z.string(),date:z.string(),amount:z.number().positive(),direction:z.enum(["IN","OUT"]),accountId:z.string(),description:z.string(),merchant:z.string(),paymentMethod:z.string(),sourceFile:z.string(),status:z.enum(["PENDING","APPROVED","REJECTED"]),confidence:z.enum(["High","Review"]),reason:z.string(),draft:z.object({}).passthrough()}).passthrough()),rules:z.array(z.object({id:z.string(),merchant:z.string().min(1),type:z.string().refine(t=>TX_TYPES.some(x=>x.type===t)),mainCategory:z.string(),subCategory:z.string()}).passthrough())}).optional()});
export function validateBackup(value:unknown):DB {
  const db=schema.parse(value) as DB;
  for(const key of ["accounts","transactions","budgets","assets","obligations","goals"] as const){const ids=db[key].map(x=>x.id);if(new Set(ids).size!==ids.length)throw new Error(`Duplicate IDs in ${key}`);}
  for(const t of db.transactions){if(!db.accounts.some(a=>a.id===t.accountId))throw new Error(`Missing account for ${t.id}`);if(t.toAccountId && !db.accounts.some(a=>a.id===t.toAccountId))throw new Error(`Missing transfer account for ${t.id}`);if(t.relatedBorrowingId && !db.borrowings.some(l=>l.loanId===t.relatedBorrowingId))throw new Error(`Missing borrowing for ${t.id}`);if(t.relatedLendingId && !db.lendings.some(l=>l.loanId===t.relatedLendingId))throw new Error(`Missing lending for ${t.id}`);if(t.relatedEmiId && !db.emiLoans.some(l=>l.loanId===t.relatedEmiId))throw new Error(`Missing EMI loan for ${t.id}`);}
  return db;
}
const encode=(rows:unknown[])=>rows.map(row=>Object.fromEntries(Object.entries(row as Record<string,unknown>).map(([k,v])=>[k,v!==null && typeof v==="object"?JSON.stringify(v):v])));
const decode=(rows:Record<string,unknown>[])=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==="string" && /^[{[]/.test(v)?(()=>{try{return JSON.parse(v);}catch{return v;}})():v])));
export function buildWorkbook(db:DB,today=todayISO()) {
  const wb=XLSX.utils.book_new();
  const append=(name:string,rows:unknown[])=>{const sheet=XLSX.utils.json_to_sheet(encode(rows));sheet["!cols"]=Array.from({length:Math.min(35,Object.keys((rows[0]??{}) as object).length)},()=>({wch:24}));XLSX.utils.book_append_sheet(wb,sheet,name);};
  append("Transactions",db.transactions);append("Accounts",db.accounts);append("Borrowings",db.borrowings);append("Lending",db.lendings);append("EMI Loans",db.emiLoans);
  append("Interest Ledger",[...db.borrowings,...db.lendings].flatMap(l=>interestLedger(l,db.transactions,today).map(r=>({loanId:l.loanId,...r}))));
  append("Principal Movements",[...db.borrowings,...db.lendings].flatMap(l=>principalMovements(l,db.transactions)));
  append("EMI Schedule",db.emiLoans.flatMap(l=>emiSchedule(l,db.transactions).rows.map(r=>({loanId:l.loanId,...r}))));
  append("Budgets",db.budgets);append("Assets",db.assets);append("Obligations",db.obligations);append("Goals",db.goals);
  append("Configuration",Object.entries(db.config).map(([key,value])=>({key,value:JSON.stringify(value)})));
  append("Monthly Summary",annualStatements(db,fyStart(today)));
  append("Bank Inbox",[...(db.bankSync?.rows??[]).map(r=>({recordType:"row",payload:JSON.stringify(r)})),...(db.bankSync?.rules??[]).map(r=>({recordType:"rule",payload:JSON.stringify(r)})),{recordType:"metadata",payload:JSON.stringify({version:2,exportedAt:today,dateFormat:"ISO YYYY-MM-DD",currency:"INR"})}]);
  return wb;
}
export function readWorkbook(wb:XLSX.WorkBook):DB {
  const required=["Transactions","Accounts","Borrowings","Lending","EMI Loans","Budgets","Assets","Obligations","Goals","Configuration","Bank Inbox"];
  if(required.some(s=>!wb.SheetNames.includes(s)))throw new Error("Not a full Khata workbook; use Bank Sync for bank statements");
  const rows=(name:string)=>decode(XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[name],{defval:undefined}));
  const config=Object.fromEntries(rows("Configuration").map(r=>[r["key"],typeof r["value"]==="string"?JSON.parse(r["value"]):r["value"]]));
  const inbox=rows("Bank Inbox");const payload=(kind:string)=>inbox.filter(r=>r["recordType"]===kind).map(r=>typeof r["payload"]==="string"?JSON.parse(r["payload"]):r["payload"]);
  return validateBackup({accounts:rows("Accounts"),transactions:rows("Transactions"),borrowings:rows("Borrowings"),lendings:rows("Lending"),emiLoans:rows("EMI Loans"),budgets:rows("Budgets"),assets:rows("Assets"),obligations:rows("Obligations"),goals:rows("Goals"),config,bankSync:{rows:payload("row"),rules:payload("rule")}});
}
export function exportFullWorkbook(db:DB){XLSX.writeFile(buildWorkbook(db),`khata-full-${fmtDate(todayISO())}.xlsx`);}