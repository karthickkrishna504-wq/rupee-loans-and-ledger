/**
 * Central Accounting & Reconciliation Engine.
 * Every dashboard, register and ledger derives its numbers from these functions.
 * Rules: borrowing/lending/principal movements/transfers/investments never touch income or expense;
 * interest paid and EMI interest are expenses; interest received is income only when received;
 * refunds offset their original expense category.
 */
import { addDays, addMonths, daysBetween, daysInMonth, fyLabel, fyStart, monthKey, parts, toISO } from "./format";
import { txMeta, type Account, type DB, type EmiLoan, type PrivateLoan, type Transaction } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function deriveDateFields(date: string) {
  const { y, m } = parts(date);
  return { month: m, year: y, financialYear: fyLabel(fyStart(date)) };
}

/* ---------------- Income / Expense classification ---------------- */
export function incomeOf(t: Transaction) {
  const n = txMeta(t.type).nature;
  if (n === "INCOME") return t.amount;
  if (n === "ASSET" && (t.type === "Investment Sale" || t.type === "Asset Sale")) return t.profitOnSale ?? 0;
  return 0;
}
export function expenseOf(t: Transaction) {
  const n = txMeta(t.type).nature;
  if (n === "EXPENSE") return t.amount;
  if (n === "EMI") return t.interestComponent ?? 0;
  if (n === "REFUND") return -t.amount; // offsets spending
  return 0;
}
export function expenseCategoryOf(t: Transaction) {
  if (t.type === "Interest Paid on Borrowing" || t.type === "EMI Payment") return "Interest Paid";
  return t.mainCategory || "Uncategorised";
}

/** Cash effect of a transaction on a given account. */
export function cashDelta(t: Transaction, accountId: string) {
  if (t.direction === "TRANSFER") {
    if (t.accountId === accountId) return -t.amount;
    if (t.toAccountId === accountId) return t.amount;
    return 0;
  }
  if (t.accountId !== accountId) return 0;
  return t.direction === "IN" ? t.amount : -t.amount;
}

export function accountStatement(acc: Account, txs: Transaction[], asOf?: string) {
  let inflows = 0, outflows = 0, transferIn = 0, transferOut = 0;
  for (const t of txs) {
    if (asOf && t.date > asOf) continue;
    if (t.direction === "TRANSFER") {
      if (t.accountId === acc.id) transferOut += t.amount;
      if (t.toAccountId === acc.id) transferIn += t.amount;
    } else if (t.accountId === acc.id) {
      if (t.direction === "IN") inflows += t.amount; else outflows += t.amount;
    }
  }
  const closing = acc.openingBalance + inflows - outflows + transferIn - transferOut;
  const variance = acc.statementBalance === undefined ? undefined : r2(acc.statementBalance - closing);
  return { opening: acc.openingBalance, inflows, outflows, transferIn, transferOut, closing, variance };
}
export const totalCash = (db: DB, asOf?: string) =>
  db.accounts.reduce((s, a) => s + accountStatement(a, db.transactions, asOf).closing, 0);

export function summarize(txs: Transaction[]) {
  let income = 0, expense = 0, interestPaid = 0, interestReceived = 0, emiPaid = 0, emiInterest = 0, emiPrincipal = 0, inflow = 0, outflow = 0;
  const byCategory: Record<string, number> = {};
  for (const t of txs) {
    income += incomeOf(t);
    const e = expenseOf(t);
    expense += e;
    if (e !== 0) byCategory[expenseCategoryOf(t)] = (byCategory[expenseCategoryOf(t)] ?? 0) + e;
    if (t.type === "Interest Paid on Borrowing") interestPaid += t.amount;
    if (t.type === "Interest Received from Money Lent") interestReceived += t.amount;
    if (t.type === "EMI Payment") {
      emiPaid += t.amount;
      emiInterest += t.interestComponent ?? 0;
      emiPrincipal += t.principalComponent ?? 0;
    }
    if (t.direction === "IN") inflow += t.amount;
    if (t.direction === "OUT") outflow += t.amount;
  }
  const savings = income - expense;
  return {
    income, expense, savings, savingsRate: income > 0 ? (savings / income) * 100 : 0,
    interestPaid, interestReceived, emiPaid, emiInterest, emiPrincipal, inflow, outflow, byCategory,
  };
}

/* ---------------- Private loans (interest-only borrowings & lending) ---------------- */
const addType = (l: PrivateLoan) => (l.kind === "BORROWED" ? "Money Borrowed" : "Money Lent to Another Person");
const settleType = (l: PrivateLoan) => (l.kind === "BORROWED" ? "Principal Repayment on Borrowing" : "Principal Received from Borrower");
const interestType = (l: PrivateLoan) => (l.kind === "BORROWED" ? "Interest Paid on Borrowing" : "Interest Received from Money Lent");
const linkedTo = (l: PrivateLoan, t: Transaction) =>
  l.kind === "BORROWED" ? t.relatedBorrowingId === l.loanId : t.relatedLendingId === l.loanId;

export interface PrincipalMovement {
  transactionId: string; date: string; loanId: string; direction: "BORROWED" | "LENT"; personName: string;
  openingPrincipal: number; additionalPrincipal: number; principalSettled: number; closingPrincipal: number;
  settlementType: "Full Settlement" | "Partial Principal Repayment" | "Additional Borrowing/Lending" | "Refinancing" | "Write-off";
  accountId: string; reference?: string;
}

export function principalMovements(l: PrivateLoan, txs: Transaction[]): PrincipalMovement[] {
  const ev = txs.filter((t) => linkedTo(l, t) && (t.type === addType(l) || t.type === settleType(l)))
    .sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return ev.map((t) => {
    const add = t.type === addType(l) ? t.amount : 0;
    const set = t.type === settleType(l) ? t.amount : 0;
    const open = bal;
    bal = r2(bal + add - set);
    return {
      transactionId: t.id, date: t.date, loanId: l.loanId, direction: l.kind, personName: l.counterparty,
      openingPrincipal: open, additionalPrincipal: add, principalSettled: set, closingPrincipal: bal,
      settlementType: add ? "Additional Borrowing/Lending" : bal <= 0 ? "Full Settlement" : "Partial Principal Repayment",
      accountId: t.accountId, reference: t.referenceNumber,
    };
  });
}
function principalAt(moves: PrincipalMovement[], date: string) {
  let p = 0;
  for (const m of moves) if (m.date <= date) p = m.closingPrincipal;
  return p;
}

export type LedgerStatus = "UPCOMING" | "DUE_TODAY" | "PAID" | "PARTIAL" | "OVERDUE" | "CLOSED";
export interface LedgerRow {
  period: number; periodStart: string; periodEnd: string; dueDate: string; openingPrincipal: number;
  applicableRate: number; interestAccrued: number; amountPaidOrReceived: number; balancePayableOrReceivable: number;
  paymentDate?: string; reference?: string; status: LedgerStatus;
}

export function periodInterest(l: PrivateLoan, principal: number, start: string, end: string) {
  switch (l.calculationMethod) {
    case "FIXED_MONTHLY_RATE": return r2((principal * l.monthlyInterestRate) / 100);
    case "ANNUAL_DIV_12": return r2((principal * l.annualInterestRate) / 1200);
    case "DAILY_ACTUAL": return r2((principal * l.annualInterestRate * (daysBetween(start, end) + 1)) / 36500);
    case "MANUAL_AMOUNT": return l.manualInterestAmount ?? 0;
  }
}

export function interestLedger(l: PrivateLoan, txs: Transaction[], today: string, horizon: string = today): LedgerRow[] {
  const moves = principalMovements(l, txs);
  const rows: LedgerRow[] = [];
  for (let i = 0; i < 600; i++) {
    const ps = addMonths(l.startDate, i);
    if (ps > horizon) break;
    const open = principalAt(moves, ps);
    if (open <= 0 && i > 0) break;
    const pe = addDays(addMonths(l.startDate, i + 1), -1);
    const nxt = addMonths(l.startDate, i + 1);
    const { y, m } = parts(nxt);
    const due = toISO(y, m, Math.min(l.interestDueDay, daysInMonth(y, m)));
    rows.push({
      period: i + 1, periodStart: ps, periodEnd: pe, dueDate: due < pe ? addMonths(due, 1, l.interestDueDay) : due,
      openingPrincipal: open, applicableRate: l.calculationMethod === "FIXED_MONTHLY_RATE" ? l.monthlyInterestRate : l.annualInterestRate / 12,
      interestAccrued: periodInterest(l, open, ps, pe), amountPaidOrReceived: 0, balancePayableOrReceivable: 0, status: "UPCOMING",
    });
  }
  // FIFO allocate actual interest payments
  const pays = txs.filter((t) => linkedTo(l, t) && t.type === interestType(l)).sort((a, b) => a.date.localeCompare(b.date));
  let ri = 0;
  for (const p of pays) {
    let left = p.amount;
    while (left > 0.005 && ri < rows.length) {
      const row = rows[ri];
      const need = r2(row.interestAccrued - row.amountPaidOrReceived);
      const take = Math.min(need, left);
      row.amountPaidOrReceived = r2(row.amountPaidOrReceived + take);
      row.paymentDate = p.date;
      row.reference = p.referenceNumber;
      left = r2(left - take);
      if (row.amountPaidOrReceived >= row.interestAccrued - 0.005) ri++;
    }
  }
  for (const row of rows) {
    row.balancePayableOrReceivable = r2(row.interestAccrued - row.amountPaidOrReceived);
    if (row.balancePayableOrReceivable <= 0.005) row.status = row.openingPrincipal <= 0 ? "CLOSED" : "PAID";
    else if (row.dueDate < today) row.status = "OVERDUE";
    else if (row.dueDate === today) row.status = "DUE_TODAY";
    else row.status = row.amountPaidOrReceived > 0 ? "PARTIAL" : "UPCOMING";
  }
  return rows;
}

export function loanSummary(l: PrivateLoan, txs: Transaction[], today: string) {
  const moves = principalMovements(l, txs);
  const added = moves.reduce((s, m) => s + m.additionalPrincipal, 0);
  const settled = moves.reduce((s, m) => s + m.principalSettled, 0);
  const outstanding = r2(added - settled);
  const ledger = interestLedger(l, txs, today);
  const overdueInterest = ledger.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + r.balancePayableOrReceivable, 0);
  const unpaidInterest = ledger.reduce((s, r) => s + r.balancePayableOrReceivable, 0);
  const interestSettled = ledger.reduce((s, r) => s + r.amountPaidOrReceived, 0);
  const nextDue = ledger.find((r) => r.balancePayableOrReceivable > 0.005);
  const maturityPassed = !!l.maturityDate && l.maturityDate < today && outstanding > 0;
  const status: "ACTIVE" | "OVERDUE" | "CLOSED" =
    outstanding <= 0 && moves.length ? "CLOSED" : overdueInterest > 0 || maturityPassed ? "OVERDUE" : "ACTIVE";
  const monthlyInterest = outstanding > 0 ? periodInterest(l, outstanding, today, addDays(addMonths(today, 1), -1)) : 0;
  const interestAccrued = r2(ledger.reduce((s, r) => s + r.interestAccrued, 0));
  const oldestOverdue = ledger.find((r) => r.status === "OVERDUE");
  const daysOverdue = oldestOverdue ? daysBetween(oldestOverdue.dueDate, today) : 0;
  return {
    original: l.originalPrincipal, additional: Math.max(0, added - l.originalPrincipal), repaid: settled, outstanding,
    ledger, moves, overdueInterest, unpaidInterest, interestSettled, nextDue, status, monthlyInterest,
    interestAccrued, daysOverdue, risk: riskOf(daysOverdue, status),
  };
}

/** Borrower risk based on the age of the oldest unpaid (overdue) interest period: 30 / 90 / 180 day buckets. */
export type RiskLevel = "Low" | "Watch" | "Moderate" | "High" | "Severe" | "Closed";
export function riskOf(daysOverdue: number, status: string = "ACTIVE"): RiskLevel {
  if (status === "CLOSED") return "Closed";
  if (daysOverdue <= 0) return "Low";
  if (daysOverdue <= 30) return "Watch";
  if (daysOverdue <= 90) return "Moderate";
  if (daysOverdue <= 180) return "High";
  return "Severe";
}

/** Cash needed to fully settle a loan on a date: outstanding principal + unpaid interest of completed
 *  periods + pro-rata interest for the running period. Compared against a lender-confirmed quote. */
export function settlementQuote(l: PrivateLoan, txs: Transaction[], date: string, lenderQuote?: number) {
  const moves = principalMovements(l, txs);
  const principal = principalAt(moves, date);
  const rows = interestLedger(l, txs, date);
  let unpaid = 0, running = 0;
  for (const r of rows) {
    const bal = r.interestAccrued - r.amountPaidOrReceived;
    if (r.periodEnd < date) unpaid += bal;
    else {
      const total = daysBetween(r.periodStart, r.periodEnd) + 1;
      const elapsed = Math.min(total, daysBetween(r.periodStart, date) + 1);
      running += Math.max(0, r2((r.interestAccrued * elapsed) / total) - r.amountPaidOrReceived);
    }
  }
  const computed = r2(principal + unpaid + running);
  return {
    principal, unpaidInterest: r2(unpaid), runningInterest: r2(running), computed,
    lenderQuote, difference: lenderQuote === undefined ? undefined : r2(lenderQuote - computed),
  };
}

export interface CalendarRow extends LedgerRow { loan: PrivateLoan; calendarStatus: LedgerStatus }
/** Rolling interest calendar: unpaid past periods + current month + next `months` months for all loans. */
export function interestCalendar(loans: PrivateLoan[], txs: Transaction[], today: string, months = 12): CalendarRow[] {
  const from = today.slice(0, 8) + "01";
  const to = addDays(addMonths(from, months + 1), -1);
  const out: CalendarRow[] = [];
  for (const l of loans) {
    const s = loanSummary(l, txs, today);
    const rows = interestLedger(l, txs, today, to);
    for (const r of rows) {
      const inWindow = r.dueDate >= from && r.dueDate <= to;
      const unpaidPast = r.dueDate < from && r.balancePayableOrReceivable > 0.005;
      if (!inWindow && !unpaidPast) continue;
      out.push({ ...r, loan: l, calendarStatus: s.status === "CLOSED" && r.balancePayableOrReceivable <= 0.005 ? "CLOSED" : r.status });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Total EMI interest under the current plan vs the same loan without any prepayments. */
export function emiInterestSaved(loan: EmiLoan, txs: Transaction[]) {
  const total = (rows: EmiRow[]) => rows.reduce((s, r) => s + r.interest, 0);
  const now = emiSchedule(loan, txs);
  const base = emiSchedule(loan, txs.filter((t) => !(t.relatedEmiId === loan.loanId && t.type === "Principal Repayment on Borrowing")));
  return { saved: r2(total(base.rows) - total(now.rows)), monthsSaved: base.rows.length - now.rows.length };
}

/* ---------------- EMI amortisation (PMT / IPMT / PPMT) ---------------- */
export function pmt(principal: number, annualRate: number, n: number) {
  const r = annualRate / 1200;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}
export const ipmt = (balance: number, annualRate: number) => balance * (annualRate / 1200);

export interface EmiRow {
  n: number; dueDate: string; opening: number; prepayment: number; emi: number; interest: number; principal: number;
  closing: number; paid: boolean; paidTxId?: string; source: "Schedule" | "Bank Split" | "Override";
}

export function emiSchedule(loan: EmiLoan, txs: Transaction[]) {
  const emi = Math.round(pmt(loan.originalAmount, loan.annualRate, loan.tenureMonths));
  const linked = txs.filter((t) => t.relatedEmiId === loan.loanId).sort((a, b) => a.date.localeCompare(b.date));
  const payments = linked.filter((t) => t.type === "EMI Payment");
  const prepays = linked.filter((t) => t.type === "Principal Repayment on Borrowing");
  const rows: EmiRow[] = [];
  let bal = loan.originalAmount;
  let prevDue = "0000-00-00";
  for (let n = 1; n <= 600 && bal > 0.5; n++) {
    const due = addMonths(loan.emiStartDate, n - 1, loan.emiDay);
    const pre = prepays.filter((p) => p.date > prevDue && p.date <= due).reduce((s, p) => s + p.amount, 0);
    const open = r2(Math.max(0, bal - pre));
    if (open <= 0.5) { bal = 0; break; }
    const tx = payments[n - 1];
    const ov = loan.overrides?.[n];
    let interest = r2(ipmt(open, loan.annualRate));
    let principal = r2(Math.min(emi - interest, open));
    let source: EmiRow["source"] = "Schedule";
    if (tx && tx.principalComponent !== undefined) { interest = tx.interestComponent ?? 0; principal = tx.principalComponent; source = "Bank Split"; }
    else if (ov) { interest = ov.interest; principal = ov.principal; source = "Override"; }
    const closing = r2(Math.max(0, open - principal));
    rows.push({ n, dueDate: due, opening: open, prepayment: pre, emi: r2(interest + principal), interest, principal, closing, paid: !!tx, paidTxId: tx?.id, source });
    bal = closing;
    prevDue = due;
  }
  const latePre = prepays.filter((p) => p.date > prevDue).reduce((s, p) => s + p.amount, 0);
  const paidPrincipal = rows.filter((r) => r.paid).reduce((s, r) => s + r.principal, 0);
  const totalPre = prepays.reduce((s, p) => s + p.amount, 0);
  const outstanding = r2(Math.max(0, loan.originalAmount - paidPrincipal - totalPre));
  const remaining = rows.filter((r) => !r.paid).length;
  const next = rows.find((r) => !r.paid);
  return { emi, rows, outstanding, remaining, next, latePrepayment: latePre, totalPrepaid: totalPre, status: outstanding <= 0 ? "CLOSED" : "ACTIVE" as "ACTIVE" | "CLOSED" };
}

/* ---------------- Portfolio-level figures ---------------- */
export function portfolio(db: DB, today: string) {
  const b = db.borrowings.map((l) => ({ loan: l, s: loanSummary(l, db.transactions, today) }));
  const ln = db.lendings.map((l) => ({ loan: l, s: loanSummary(l, db.transactions, today) }));
  const e = db.emiLoans.map((l) => ({ loan: l, s: emiSchedule(l, db.transactions) }));
  const borrowOut = b.reduce((s, x) => s + x.s.outstanding, 0);
  const lentOut = ln.reduce((s, x) => s + x.s.outstanding, 0);
  const emiOut = e.reduce((s, x) => s + x.s.outstanding, 0);
  const cash = totalCash(db, today);
  const invested = db.transactions.reduce((s, t) => {
    if (t.type === "Investment Purchase" || t.type === "Asset Purchase") return s + t.amount;
    if (t.type === "Investment Sale" || t.type === "Asset Sale") return s - t.amount;
    return s;
  }, 0);
  const otherAssets = db.assets.reduce((s, a) => s + a.currentValue, 0);
  const totalAssets = cash + lentOut + invested + otherAssets;
  const totalLiabilities = borrowOut + emiOut;
  const in30 = addDays(today, 30);
  const upcomingEmis = e.flatMap((x) => x.s.rows.filter((r) => !r.paid && r.dueDate <= in30));
  const monthlyObligations =
    e.filter((x) => x.s.status === "ACTIVE").reduce((s, x) => s + x.s.emi, 0) +
    b.filter((x) => x.s.outstanding > 0).reduce((s, x) => s + x.s.monthlyInterest, 0) +
    db.obligations.reduce((s, o) => s + o.amount, 0);
  return {
    borrowings: b, lendings: ln, emis: e, borrowOut, lentOut, emiOut, cash, invested, otherAssets, totalAssets, totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    overdueReceivables: ln.reduce((s, x) => s + x.s.overdueInterest, 0),
    overduePayables: b.reduce((s, x) => s + x.s.overdueInterest, 0),
    upcomingEmis, upcomingEmiAmount: upcomingEmis.reduce((s, r) => s + r.emi, 0), monthlyObligations,
  };
}

export function filterByPeriod(txs: Transaction[], period: string) {
  if (period === "ALL") return txs;
  if (period.startsWith("M:")) return txs.filter((t) => monthKey(t.date) === period.slice(2));
  if (period.startsWith("FY:")) { const y = Number(period.slice(3)); return txs.filter((t) => fyStart(t.date) === y); }
  return txs;
}

/* Derived statements: existing classifications and portfolio formulas remain authoritative. */
export function monthlyStatement(db: DB, month: string) {
  const from = `${month}-01`, end = addDays(addMonths(from, 1), -1);
  const txs = filterByPeriod(db.transactions, `M:${month}`);
  const s = summarize(txs);
  const historical = { ...db, transactions: db.transactions.filter(t => t.date <= end), borrowings: db.borrowings.filter(l=>l.startDate<=end), lendings: db.lendings.filter(l=>l.startDate<=end), emiLoans: db.emiLoans.filter(l=>l.disbursementDate<=end), assets: db.assets.filter(a=>!a.acquiredDate || a.acquiredDate<=end) };
  const p = portfolio(historical, end);
  const sum = (type: Transaction["type"]) => txs.filter(t=>t.type===type).reduce((n,t)=>n+t.amount,0);
  const borrowed=sum("Money Borrowed"), repaid=sum("Principal Repayment on Borrowing")+s.emiPrincipal;
  const lent=sum("Money Lent to Another Person"), recovered=sum("Principal Received from Borrower");
  const purchases=sum("Asset Purchase")+sum("Investment Purchase"), sales=sum("Asset Sale")+sum("Investment Sale");
  const financing=borrowed-repaid-lent+recovered-purchases+sales;
  const opening=totalCash(db,addDays(from,-1)),closing=totalCash(db,end);
  return {month,...s,ordinaryExpenses:s.expense-s.interestPaid-s.emiInterest,operating:s.income-s.expense,borrowed,repaid,lent,recovered,purchases,sales,transfers:sum("Transfer Between Own Accounts"),financing,opening,closing,netCash:s.income-s.expense+financing,netWorth:p.netWorth,cash:p.cash,assets:p.totalAssets,liabilities:p.totalLiabilities,lentOutstanding:p.lentOut,borrowingOutstanding:p.borrowOut,emiOutstanding:p.emiOut,unpaidInterestPayable:p.borrowings.reduce((n,x)=>n+x.s.unpaidInterest,0),unpaidInterestReceivable:p.lendings.reduce((n,x)=>n+x.s.unpaidInterest,0)};
}
export const ANNUAL_METRICS = ["income","expense","savings","interestPaid","interestReceived","emiPaid","emiInterest","emiPrincipal","borrowed","repaid","lent","recovered","purchases","sales","operating","financing","netCash","closing","netWorth","liabilities"] as const;
export function annualStatements(db:DB,year:number){return Array.from({length:12},(_,i)=>monthlyStatement(db,addMonths(`${year}-04-01`,i).slice(0,7)));}
export function budgetStatement(db:DB,month:string) {
  const current=summarize(filterByPeriod(db.transactions,`M:${month}`));
  const previous=summarize(filterByPeriod(db.transactions,`M:${addMonths(`${month}-01`,-1).slice(0,7)}`));
  return db.budgets.map(b=>({...b,actual:current.byCategory[b.category]??0,previous:previous.byCategory[b.category]??0,variance:b.monthlyLimit-(current.byCategory[b.category]??0)}));
}
export function assetValues(db:DB) {
  return db.assets.map(a=>{const linked=db.transactions.filter(t=>t.relatedAssetId===a.id);const book=linked.reduce((n,t)=>n+((t.type==="Asset Purchase" || t.type==="Investment Purchase")?t.amount:(t.type==="Asset Sale" || t.type==="Investment Sale")?-t.amount:0),0);return {...a,book:linked.length?book:a.bookValue??a.currentValue,linked:linked.length>0};});
}
export function commitmentStatement(db:DB,today:string,days:number) {
  const end=addDays(today,days);
  const rows:{id:string;name:string;kind:string;date:string;amount:number;overdue:boolean;direction:"IN"|"OUT"}[]=[];
  for(const l of db.borrowings){for(const r of interestLedger(l,db.transactions,today,end)){if(r.dueDate<=end && r.balancePayableOrReceivable>0.005)rows.push({id:`${l.loanId}-${r.period}`,name:l.counterparty,kind:"Borrowing interest",date:r.dueDate,amount:r.balancePayableOrReceivable,overdue:r.dueDate<today,direction:"OUT"});}}
  for(const l of db.lendings){for(const r of interestLedger(l,db.transactions,today,end)){if(r.dueDate<=end && r.balancePayableOrReceivable>0.005)rows.push({id:`${l.loanId}-${r.period}`,name:l.counterparty,kind:"Lending interest",date:r.dueDate,amount:r.balancePayableOrReceivable,overdue:r.dueDate<today,direction:"IN"});}}
  for(const l of db.emiLoans){for(const r of emiSchedule(l,db.transactions).rows){if(!r.paid && r.dueDate<=end)rows.push({id:`${l.loanId}-${r.n}`,name:l.lender,kind:"EMI",date:r.dueDate,amount:r.emi,overdue:r.dueDate<today,direction:"OUT"});}}
  for(const o of db.obligations){for(let i=0;i<=Math.ceil(days/28);i++){const first=today.slice(0,8)+"01",month=addMonths(first,i);const {y,m}=parts(month);const date=toISO(y,m,Math.min(o.dueDay,daysInMonth(y,m)));if(date<today || date>end)continue;
    const paid=db.transactions.filter(t=>monthKey(t.date)===monthKey(date) && expenseOf(t)>0 && (o.accountId?o.accountId===t.accountId:true) && t.description.trim().toLowerCase()===o.name.trim().toLowerCase()).reduce((n,t)=>n+expenseOf(t),0);
    const amount=Math.max(0,o.amount-paid);if(amount>0)rows.push({id:`${o.id}-${date}`,name:o.name,kind:o.category??"Recurring obligation",date,amount,overdue:false,direction:"OUT"});}}
  return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
