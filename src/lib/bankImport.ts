import * as XLSX from "xlsx";
const { utils, read, SSF } = XLSX;
import { emiSchedule, loanSummary, deriveDateFields } from "./accountingEngine";
import { daysInMonth } from "./format";
import { txMeta, TX_TYPES, type DB, type StagedBankRow, type Transaction, type MerchantRule } from "./types";

const clean = (v: unknown) => String(v ?? "").trim();
const canonical = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function parseBankDate(value: unknown): string | null {
  if (typeof value === "number") { const d = SSF.parse_date_code(value); return d ? parseBankDate(`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`) : null; }
  const s = clean(value);
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const indian = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})\b/);
  const named = s.match(/\b(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2}|\d{4})\b/);
  let y: number, m: number, d: number;
  if (iso) { y=Number(iso[1]); m=Number(iso[2]); d=Number(iso[3]); }
  else if (indian) { d=Number(indian[1]); m=Number(indian[2]); y=Number(indian[3]); if(y<100)y+=2000; }
  else if (named) { d=Number(named[1]); m=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(named[2].toLowerCase())+1; y=Number(named[3]); if(y<100)y+=2000; }
  else return null;
  if(y<1900 || y>2200 || m<1 || m>12 || d<1 || d>daysInMonth(y,m))return null;
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
export const bankAmount = (v: unknown) => { const s=clean(v).replace(/[,₹\s]/g,"").replace(/(?:INR|RS\.?|CR|DR)/gi,""); const n=Number(s.replace(/[()]/g,"")); return Number.isFinite(n)?Math.abs(n):0; };
export function parseNarration(text: string) {
  const upiId = text.match(/[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9.-]*/)?.[0];
  const tokens = text.split(/[/|]/).map(s=>s.trim()).filter(Boolean);
  const referenceNumber = text.match(/(?:UTR|REF(?:ERENCE)?(?:\s*NO)?|RRN|UPI\s*(?:REF)?)(?:[\s:#/-]+)([A-Z0-9]{6,})/i)?.[1]
    ?? tokens.find(t=>/^\d{6,}$/.test(t)) ?? text.match(/\b\d{8,}\b/)?.[0];
  let merchant = "";
  if (/UPI/i.test(text)) merchant=tokens.find((t,i)=>i>0 && !/^(DR|CR|UPI|HDFC|ICICI|SBI|AXIS|KOTAK|BANK)$/i.test(t) && !/^\d+$/.test(t) && !t.includes("@")) ?? upiId?.split("@")[0] ?? "";
  if (!merchant && /^(NEFT|IMPS|RTGS)/i.test(text)) merchant=text.replace(/^(NEFT|IMPS|RTGS)[/-](CR[/-]|DR[/-])?/i,"").split(/[/]/).filter(t=>!/^\d+$/.test(t)).join(" ").replace(/-INT$/i,"");
  if(!merchant)merchant=text.match(/(?:from|to|at)\s+([^.;]+?)(?=\s+(?:on|via|UPI|Ref|UTR|Avl)|[.;]|$)/i)?.[1] ?? text;
  // Clean display description: humanise the merchant, keep channel prefix.
  const channel = /UPI/i.test(text)?"UPI":/NEFT/i.test(text)?"NEFT":/IMPS/i.test(text)?"IMPS":/RTGS/i.test(text)?"RTGS":undefined;
  const rawMerchant = merchant.trim();
  const cleaned = rawMerchant.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return { merchant: rawMerchant, description: channel ? `${cleaned} · ${channel}` : cleaned, upiId, referenceNumber,
    paymentMethod: /NEFT/i.test(text)?"NEFT":/IMPS/i.test(text)?"IMPS":/RTGS/i.test(text)?"RTGS":/UPI/i.test(text)?"UPI":"Bank Transfer" };
}

/** Enforce a unique (account, reference) pair: later duplicates of an approved reference are rejected. */
export function duplicateReferenceExists(db: DB, accountId: string, referenceNumber?: string) {
  if (!referenceNumber) return false;
  const ref = canonical(referenceNumber);
  return db.transactions.some((t) => t.accountId === accountId && t.referenceNumber && canonical(t.referenceNumber) === ref);
}
export function bankFingerprint(r: {date:string; amount:number; direction:string; accountId:string; referenceNumber?:string; description:string}) {
  const text=[r.date,r.amount.toFixed(2),r.direction,r.accountId,canonical(r.referenceNumber || r.description)].join("|");
  // Two independent deterministic 32-bit hashes; no randomness or bank data leaves the device.
  let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return `${(a>>>0).toString(16).padStart(8,"0")}${(b>>>0).toString(16).padStart(8,"0")}`;
}
const sameName=(text:string,name:string)=> { const words=name.toUpperCase().split(/\s+/).filter(w=>w.length>2 && w!=="BANK"); return words.length>0 && words.every(w=>text.toUpperCase().includes(w)); };
export function suggestBankRow(row: StagedBankRow, db: DB): StagedBankRow {
  const text=`${row.description} ${row.merchant}`;
  const rules=(db.bankSync?.rules??[]).filter(r=>canonical(text).includes(canonical(r.merchant)) && canonical(r.merchant));
  const direction = row.direction;
  const draft: Partial<Transaction>={};
  let reason="Choose the transaction type and review category before approval", confidence:StagedBankRow["confidence"]="Review";
  const candidates=(direction==="IN"?db.lendings:db.borrowings).map(loan=>({loan,s:loanSummary(loan,db.transactions.filter(t=>t.date<=row.date),row.date)})).filter(x=>x.s.outstanding>0);
  const named=candidates.filter(x=>sameName(text,x.loan.counterparty));
  const amountMatches=candidates.filter(x=>Math.abs(x.s.monthlyInterest-row.amount)<0.01 || x.s.ledger.some(r=>Math.abs(r.balancePayableOrReceivable-row.amount)<0.01));
  const match=named.length===1?named[0]:amountMatches.length===1?amountMatches[0]:undefined;
  if(match) {
    const interest=amountMatches.includes(match);
    draft.type=interest?(direction==="IN"?"Interest Received from Money Lent":"Interest Paid on Borrowing"):undefined;
    if(direction==="IN")draft.relatedLendingId=match.loan.loanId;else draft.relatedBorrowingId=match.loan.loanId;
    draft.relatedPerson=match.loan.counterparty;draft.mainCategory=interest?"Interest":"Loans";
    reason=interest?`Expected interest matches ${match.loan.counterparty}`:`${match.loan.counterparty}: interest, principal, or new loan movement?`;
    confidence=interest && named.includes(match)?"High":"Review";
  } else if(direction==="OUT") {
    const emis=db.emiLoans.map(loan=>({loan,next:emiSchedule(loan,db.transactions.filter(t=>t.date<=row.date)).next})).filter(x=>x.next && Math.abs(x.next.emi-row.amount)<0.01);
    if(emis.length===1){const e=emis[0];draft.type="EMI Payment";draft.relatedEmiId=e.loan.loanId;draft.interestComponent=e.next?.interest;draft.principalComponent=e.next?.principal;draft.mainCategory="EMI";reason=`Scheduled EMI matches ${e.loan.lender}`;confidence=sameName(text,e.loan.lender)?"High":"Review";}
  }
  if(!match && !draft.type && rules.length===1 && txMeta(rules[0].type).dir===direction){ Object.assign(draft,rules[0]);delete (draft as Record<string,unknown>)["merchant"];delete draft.id;reason=`Remembered merchant rule: ${rules[0].merchant}`;confidence="High"; }
  return {...row,draft,reason,confidence};
}
function makeRow(date:string,amount:number,direction:"IN"|"OUT",description:string,accountId:string,sourceFile:string,extra:Partial<StagedBankRow>={}):StagedBankRow {
  const parsed=parseNarration(description);const data={date,amount,direction,description,accountId,...parsed,...extra};const fingerprint=bankFingerprint(data);
  return {...data,id:`BANK-${fingerprint}`,fingerprint,sourceFile,status:"PENDING",confidence:"Review",reason:"",draft:{}};
}
export function parseBankGrid(grid: unknown[][], accountId:string, sourceFile:string) {
  const errors:string[]=[];const rows:StagedBankRow[]=[];
  const headers=grid.findIndex(r=>r.some(c=>/^(transaction\s*date|txn\s*date|date|value\s*date|posting\s*date)$/i.test(clean(c))) && r.some(c=>/narration|description|particular|remark|details/i.test(clean(c))));
  if(headers<0)return {rows,errors:[`${sourceFile}: Date and narration columns not found. Add Date, Narration, Debit and Credit headers.`]};
  const h=grid[headers].map(c=>clean(c).toLowerCase());
  const find=(re:RegExp)=>h.findIndex(c=>re.test(c));
  const date=find(/^(transaction\s*date|txn\s*date|date|posting\s*date)$/);const di=date>=0?date:find(/value\s*date/);
  const ni=find(/narration|description|particular|remark|details/),de=find(/debit|withdrawal|withdraw/),cr=find(/credit|deposit/),ba=find(/balance/),ref=find(/reference|ref\b|utr|cheque|chq/),am=find(/^amount|transaction amount/),dr=find(/dr\s*\/\s*cr|type|direction/);
  grid.slice(headers+1).forEach((r,i)=>{
    if(!r.some(c=>clean(c)))return;
    const date=parseBankDate(r[di]);const description=clean(r[ni]);const debit=bankAmount(r[de]),credit=bankAmount(r[cr]);
    let amount=debit || credit,direction:"IN"|"OUT"=debit?"OUT":"IN";
    if(!amount && am>=0){amount=bankAmount(r[am]);const indicator=`${clean(r[dr])} ${clean(r[am])}`; if(/DR|debit|withdraw|^-|\(/i.test(indicator))direction="OUT";else if(/CR|credit|deposit/i.test(indicator))direction="IN";else {errors.push(`Row ${headers+i+2}: missing debit/credit direction`);return;}}
    if(!date || !amount || (debit>0 && credit>0)){ if(amount || description)errors.push(`Row ${headers+i+2}: invalid date, amount or ambiguous debit/credit`);return; }
    rows.push(makeRow(date,amount,direction,description,accountId,sourceFile,{...(ref>=0 && clean(r[ref])?{referenceNumber:clean(r[ref])}:{}),...(ba>=0 && clean(r[ba])?{balance:Number(clean(r[ba]).replace(/[,₹\s]/g,""))}: {})}));
  });return {rows,errors};
}
export function parseBankFile(data:ArrayBuffer,accountId:string,name:string){
  const wb=read(data,{type:"array",cellDates:false});const rows:StagedBankRow[]=[],errors:string[]=[];
  for(const sheet of wb.SheetNames){const result=parseBankGrid(utils.sheet_to_json<unknown[]>(wb.Sheets[sheet],{header:1,defval:"",raw:true}),accountId,name);rows.push(...result.rows);errors.push(...result.errors);}
  return {rows,errors};
}
export function parseBankSms(text:string,accountId:string,fallbackDate:string){
  const errors:string[]=[],rows:StagedBankRow[]=[];
  text.split(/\n\s*\n|\n(?=.*(?:debited|credited|paid|received|sent))/i).filter(s=>s.trim()).forEach((s,i)=>{
    const money=s.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    const incoming=/credited|received|deposited/i.test(s),outgoing=/debited|paid|sent|spent|withdrawn/i.test(s);
    const dateMatch=s.match(/\b\d{1,2}[-/]\d{1,2}[-/](?:\d{4}|\d{2})\b/);
    const date=dateMatch?parseBankDate(dateMatch[0]):parseBankDate(fallbackDate);
    if(!money || incoming===outgoing || !date){errors.push(`Alert ${i+1}: amount, date or direction could not be identified`);return;}
    rows.push(makeRow(date,bankAmount(money[1]),incoming?"IN":"OUT",s.trim(),accountId,"SMS / UPI paste"));
  });return {rows,errors};
}
export function stageBankRows(db:DB, incoming:StagedBankRow[]) {
  const known=new Set([...(db.bankSync?.rows??[]).map(r=>r.fingerprint),...db.transactions.flatMap(t=>t.direction==="TRANSFER"?[bankFingerprint({...t,direction:"OUT"}),...(t.toAccountId?[bankFingerprint({...t,direction:"IN",accountId:t.toAccountId})]:[])]:[bankFingerprint(t)])]);
  const rows:StagedBankRow[]=[];let duplicates=0;
  for(const r of incoming){if(known.has(r.fingerprint)){duplicates++;continue;} known.add(r.fingerprint);rows.push(suggestBankRow(r,db));}
  return {db:{...db,bankSync:{rows:[...(db.bankSync?.rows??[]),...rows],rules:db.bankSync?.rules??[]}},added:rows.length,duplicates};
}
export function stagedTransaction(row:StagedBankRow,db:DB):Transaction {
  const d=row.draft;
  if(!d.type || !TX_TYPES.some(t=>t.type===d.type))throw new Error("Choose a transaction type");
  const meta=txMeta(d.type);
  if(!(row.amount>0) || !parseBankDate(row.date) || !db.accounts.some(a=>a.id===row.accountId))throw new Error("Valid account, date and positive amount required");
  if(meta.dir!==row.direction && meta.dir!=="TRANSFER")throw new Error("Type does not match bank debit/credit");
  if(meta.dir==="TRANSFER" && (!d.toAccountId || d.toAccountId===row.accountId || !db.accounts.some(a=>a.id===d.toAccountId)))throw new Error("Choose a different destination account; approve the debit side only");
  if(meta.dir==="TRANSFER" && row.direction!=="OUT")throw new Error("Approve transfers using the debit side only");
  if(meta.link==="lending" && !db.lendings.some(l=>l.loanId===d.relatedLendingId))throw new Error("Select a lending loan");
  if(duplicateReferenceExists(db,row.accountId,row.referenceNumber))throw new Error("A transaction with this reference already exists for this account");
  if(meta.link==="borrowing" && !db.borrowings.some(l=>l.loanId===d.relatedBorrowingId))throw new Error("Select a borrowing loan");
  if(meta.link==="borrowing_or_emi" && !db.borrowings.some(l=>l.loanId===d.relatedBorrowingId) && !db.emiLoans.some(l=>l.loanId===d.relatedEmiId))throw new Error("Select a borrowing or EMI loan");
  if(meta.link==="emi"){
    const l=db.emiLoans.find(l=>l.loanId===d.relatedEmiId);if(!l)throw new Error("Select an EMI loan");
    if(d.interestComponent===undefined || d.principalComponent===undefined || d.interestComponent<0 || d.principalComponent<0 || Math.abs(d.interestComponent+d.principalComponent-row.amount)>0.01)throw new Error("EMI interest and principal must equal bank amount");
    if(d.principalComponent>emiSchedule(l,db.transactions).outstanding+0.01)throw new Error("EMI principal exceeds outstanding");
  }
  if(d.type==="Principal Repayment on Borrowing" || d.type==="Principal Received from Borrower"){
    const l=[...db.borrowings,...db.lendings].find(l=>l.loanId===(d.relatedBorrowingId??d.relatedLendingId));
    const e=db.emiLoans.find(l=>l.loanId===d.relatedEmiId);
    const outstanding=l?loanSummary(l,db.transactions.filter(t=>t.date<=row.date),row.date).outstanding:e?emiSchedule(e,db.transactions.filter(t=>t.date<=row.date)).outstanding:0;
    if(row.amount>outstanding+0.01)throw new Error("Principal exceeds outstanding on bank date");
  }
  if((meta.nature==="EXPENSE" || meta.nature==="REFUND") && !d.mainCategory)throw new Error("Select an expense category");
  const parsedDesc=parseNarration(row.description);
  return {...d,id:`IMP-${row.fingerprint}`,date:row.date,amount:row.amount,accountId:row.accountId,
    description: d.description || parsedDesc.description,referenceNumber:row.referenceNumber,
    notes: row.description !== parsedDesc.description ? row.description : d.notes,
    paymentMethod:row.paymentMethod,mainCategory:d.mainCategory??"",subCategory:d.subCategory??"",source:"Bank Import",direction:meta.dir,...deriveDateFields(row.date)} as Transaction;
}
export function approveBankRows(db:DB,ids:string[]) {
  let next=db;const errors:string[]=[];let approved=0;
  const rows=(db.bankSync?.rows??[]).map(r=>({...r}));
  const known=new Set(db.transactions.flatMap(t=>t.direction==="TRANSFER"?[bankFingerprint({...t,direction:"OUT"}),...(t.toAccountId?[bankFingerprint({...t,direction:"IN",accountId:t.toAccountId})]:[])]:[bankFingerprint(t)]));
  for(const row of rows.filter(r=>ids.includes(r.id) && r.status==="PENDING").sort((a,b)=>a.date.localeCompare(b.date))){
    try{if(known.has(row.fingerprint))throw new Error("Already in register");const tx=stagedTransaction(row,next);next={...next,transactions:[...next.transactions,tx]};known.add(row.fingerprint);if(tx.direction==="TRANSFER" && tx.toAccountId)known.add(bankFingerprint({...tx,direction:"IN",accountId:tx.toAccountId}));row.status="APPROVED";approved++;}
    catch(e){errors.push(`${row.merchant}: ${e instanceof Error?e.message:"Invalid row"}`);}
  }
  return {db:{...next,bankSync:{rows,rules:db.bankSync?.rules??[]}},approved,errors};
}
export function ruleFromRow(row:StagedBankRow):MerchantRule {
  const d=row.draft;if(!d.type || !d.mainCategory || txMeta(d.type).link || txMeta(d.type).dir==="TRANSFER")throw new Error("Remember only ordinary income/expense merchant rules");
  if(!row.merchant.trim())throw new Error("Merchant name required");
  return {id:`RULE-${canonical(row.merchant)}`,merchant:row.merchant,type:d.type,mainCategory:d.mainCategory,subCategory:d.subCategory??"",essentialOrDiscretionary:d.essentialOrDiscretionary,needOrWant:d.needOrWant,personalOrBusiness:d.personalOrBusiness,fixedOrVariable:d.fixedOrVariable};
}