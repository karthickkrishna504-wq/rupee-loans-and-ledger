import { accountStatement, deriveDateFields, emiSchedule, loanSummary, summarize } from "./accountingEngine";
import type { PrivateLoan, Transaction, TxType } from "./types";

export function runAccountingAudit() {
  const loan:PrivateLoan={loanId:"AUD-B",kind:"BORROWED",counterparty:"Audit lender",originalPrincipal:500000,startDate:"2026-01-01",annualInterestRate:24,monthlyInterestRate:2,calculationMethod:"FIXED_MONTHLY_RATE",paymentFrequency:"Monthly",interestDueDay:5};
  const tx=(id:string,type:TxType,amount:number,date:string,extra:Partial<Transaction>={}):Transaction=>({id,type,amount,date,accountId:"A",direction:type==="Money Borrowed" || type==="Interest Received from Money Lent"?"IN":"OUT",description:id,mainCategory:"",subCategory:"",paymentMethod:"UPI",source:"Manual",relatedBorrowingId:loan.loanId,...deriveDateFields(date),...extra});
  const base=[tx("borrow","Money Borrowed",500000,"2026-01-01")];
  const paid=[...base,...["2026-02-05","2026-03-05","2026-04-05"].map((d,i)=>tx(`interest-${i}`,"Interest Paid on Borrowing",10000,d))];
  const partial=[...paid,tx("partial","Principal Repayment on Borrowing",100000,"2026-04-01")];
  const ps=loanSummary(loan,partial,"2026-05-10");
  const closed=loanSummary(loan,[...partial,tx("close","Principal Repayment on Borrowing",400000,"2026-05-01")],"2026-12-01");
  const lending:PrivateLoan={...loan,loanId:"AUD-L",kind:"LENT",originalPrincipal:200000};
  const lent=[tx("lend","Money Lent to Another Person",200000,"2026-01-01",{relatedBorrowingId:undefined,relatedLendingId:lending.loanId}),tx("received","Interest Received from Money Lent",4000,"2026-02-05",{relatedBorrowingId:undefined,relatedLendingId:lending.loanId})];
  const el={loanId:"AUD-E",lender:"Audit bank",loanType:"Personal" as const,originalAmount:600000,annualRate:11,tenureMonths:36,disbursementDate:"2026-01-01",emiStartDate:"2026-02-05",emiDay:5,processingFee:0};
  const e=emiSchedule(el,[]),first=e.rows[0];
  const emi=first?tx("emi","EMI Payment",first.emi,first.dueDate,{relatedEmiId:el.loanId,interestComponent:first.interest,principalComponent:first.principal}):undefined;
  const transfer=tx("transfer","Transfer Between Own Accounts",10000,"2026-02-01",{direction:"TRANSFER",toAccountId:"B"});
  const account=(id:string)=>({id,name:id,type:"Savings" as const,openingBalance:20000});
  const check=(name:string,actual:unknown,expected:unknown)=>({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
  return [
    check("₹5L borrowing is liability, never income",[loanSummary(loan,base,"2026-01-01").outstanding,summarize(base).income],[500000,0]),
    check("2% monthly interest on ₹5L is ₹10,000",loanSummary(loan,base,"2026-02-01").monthlyInterest,10000),
    check("Three months paid interest totals ₹30,000",loanSummary(loan,paid,"2026-04-05").interestSettled,30000),
    check("₹1L repayment leaves ₹4L and ₹8,000 interest",[ps.outstanding,ps.monthlyInterest,ps.interestSettled],[400000,8000,30000]),
    check("Full closure stops future interest",[closed.status,closed.outstanding,closed.monthlyInterest],["CLOSED",0,0]),
    check("₹2L lending earns ₹4,000 only when received",[loanSummary(lending,lent,"2026-02-05").outstanding,summarize(lent).income,summarize(lent).expense],[200000,4000,0]),
    check("EMI splits principal and interest",emi?[e.emi,Math.round((emi.principalComponent??0)+(emi.interestComponent??0)),summarize([emi]).expense===emi.interestComponent]:[],[19643,19643,true]),
    check("₹10,000 internal transfer has zero profit impact",[accountStatement(account("A"),[transfer]).closing,accountStatement(account("B"),[transfer]).closing,summarize([transfer]).income+summarize([transfer]).expense],[10000,30000,0]),
    check("Unpaid interest accrues without becoming income",[loanSummary(lending,lent.slice(0,1),"2026-02-06").overdueInterest,summarize(lent.slice(0,1)).income],[4000,0]),
  ];
}