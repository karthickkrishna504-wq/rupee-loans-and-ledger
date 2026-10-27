import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed";
import { accountStatement, emiSchedule, loanSummary, summarize } from "@/lib/accountingEngine";
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
});
