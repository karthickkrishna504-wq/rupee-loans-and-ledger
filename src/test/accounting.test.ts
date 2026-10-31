import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed";
import { accountStatement, emiSchedule, loanSummary, riskOf, summarize } from "@/lib/accountingEngine";
import type { PrivateLoan } from "@/lib/types";
import type { Transaction } from "@/lib/types";

const db = buildSeed();
const today = "2026-10-26";
const only = (type: string) => db.transactions.filter((t) => t.type === type);

describe("accounting rules", () => {
  it("borrowing is never income", () => expect(summarize(only("Money Borrowed")).income).toBe(0));
  it("lending is never an expense", () => expect(summarize(only("Money Lent to Another Person")).expense).toBe(0));
  it("principal received is never income", () => expect(summarize(only("Principal Received from Borrower")).income).toBe(0));
  it("transfers have zero income/expense impact", () => {
    const s = summarize(only("Transfer Between Own Accounts"));
    expect(s.income + s.expense).toBe(0);
  });
  it("EMI counts only interest as expense", () => {
    const e = only("EMI Payment");
    expect(summarize(e).expense).toBeCloseTo(e.reduce((a, t) => a + (t.interestComponent ?? 0), 0));
  });
  it("2%/month on ₹5,00,000 accrues ₹10,000 and Sep period is overdue", () => {
    const s = loanSummary(db.borrowings[0], db.transactions, today);
    expect(s.ledger[0].interestAccrued).toBe(10000);
    expect(s.outstanding).toBe(500000);
    expect(s.overdueInterest).toBe(10000);
  });
  it("principal recovery reduces lent outstanding to ₹1,50,000", () => {
    expect(loanSummary(db.lendings[0], db.transactions, today).outstanding).toBe(150000);
  });
  it("EMI of ₹6,00,000 @11% for 36 months is ₹19,643", () => {
    expect(emiSchedule(db.emiLoans[0], db.transactions).emi).toBe(19643);
  });
  it("transfer moves cash between accounts", () => {
    const acc = { id: "A", name: "A", type: "Savings" as const, openingBalance: 1000 };
    const t = { id: "1", date: "2026-05-01", direction: "TRANSFER", amount: 400, accountId: "A", toAccountId: "B" } as Transaction;
    expect(accountStatement(acc, [t]).closing).toBe(600);
  });

  const loan: PrivateLoan = { loanId: "L1", kind: "BORROWED", counterparty: "X", originalPrincipal: 500000, startDate: "2026-01-01", annualInterestRate: 24, monthlyInterestRate: 2, calculationMethod: "FIXED_MONTHLY_RATE", paymentFrequency: "Monthly", interestDueDay: 5 };
  const tx = (id: string, type: string, amount: number, date: string) => ({ id, type, amount, date, accountId: "A", relatedBorrowingId: "L1" } as Transaction);
  const base = [tx("b", "Money Borrowed", 500000, "2026-01-01"), tx("i", "Interest Paid on Borrowing", 10000, "2026-02-05")];
  it("partial ₹1,00,000 repayment drops outstanding to ₹4,00,000 and interest to ₹8,000, keeps interest paid", () => {
    const s = loanSummary(loan, [...base, tx("r", "Principal Repayment on Borrowing", 100000, "2026-02-01")], "2026-03-10");
    expect(s.outstanding).toBe(400000);
    expect(s.monthlyInterest).toBe(8000);
    expect(s.interestSettled).toBe(10000);
  });
  it("full settlement closes the loan and stops interest", () => {
    const s = loanSummary(loan, [...base, tx("r", "Principal Repayment on Borrowing", 500000, "2026-02-01")], "2026-12-10");
    expect(s.status).toBe("CLOSED");
    expect(s.monthlyInterest).toBe(0);
    expect(s.ledger.length).toBe(1);
  });
  it("borrower risk buckets at 30/90/180 days", () => {
    expect([riskOf(0), riskOf(30), riskOf(90), riskOf(180), riskOf(181)]).toEqual(["Low", "Watch", "Moderate", "High", "Severe"]);
  });
});
