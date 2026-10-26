import { accountStatement, deriveDateFields, emiSchedule } from "./accountingEngine";
import { toISO } from "./format";
import { txMeta, type DB, type MasterConfig, type Transaction, type TxType } from "./types";

export const defaultConfig = (): MasterConfig => ({
  expenseCategories: {
    Housing: ["Rent", "Maintenance", "Repairs"],
    Food: ["Groceries", "Dining Out", "Swiggy/Zomato"],
    Utilities: ["Electricity", "Mobile", "Internet", "Gas"],
    Transport: ["Fuel", "Cab", "Metro"],
    Shopping: ["Clothes", "Electronics", "Home"],
    Health: ["Medicines", "Doctor", "Insurance"],
    Education: ["Fees", "Books"],
    Entertainment: ["OTT", "Movies", "Travel"],
    Business: ["Office", "Software", "Travel", "Staff"],
  },
  incomeCategories: ["Salary", "Business", "Freelance", "Rental", "Dividend", "Other"],
  paymentMethods: ["UPI", "NEFT", "IMPS", "RTGS", "Cash", "Debit Card", "Credit Card", "Cheque", "Auto-Debit"],
  people: ["Ramesh Kumar", "Suresh Babu"],
});

/** Validation dataset: ₹5,00,000 borrowed @2%/month, ₹2,00,000 lent @2%/month, ₹6,00,000 personal EMI loan. */
export function buildSeed(): DB {
  const txs: Transaction[] = [];
  let i = 0;
  const add = (date: string, type: TxType, amount: number, accountId: string, extra: Partial<Transaction> = {}) => {
    const t: Transaction = {
      id: `TX-${String(++i).padStart(4, "0")}`, date, type, amount, accountId,
      mainCategory: "", subCategory: "", description: type, paymentMethod: "UPI", source: "Manual",
      ...deriveDateFields(date), direction: txMeta(type).dir, ...extra,
    };
    txs.push(t);
    return t;
  };
  const H = "ACC-HDFC", C = "ACC-CASH", I = "ACC-ICICI", W = "ACC-PAYTM";

  add("2026-04-01", "Money Borrowed", 500000, H, { relatedBorrowingId: "BRW-001", relatedPerson: "Ramesh Kumar", mainCategory: "Loans", description: "Private loan from Ramesh @2%/month", paymentMethod: "NEFT", referenceNumber: "UTR2604011" });
  add("2026-04-05", "Money Borrowed", 600000, H, { relatedEmiId: "EMI-001", relatedPerson: "HDFC Bank", mainCategory: "Loans", description: "Personal loan disbursement", paymentMethod: "NEFT" });
  add("2026-05-10", "Money Lent to Another Person", 200000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Loans", description: "Lent to Suresh @2%/month", paymentMethod: "IMPS" });

  const months = [4, 5, 6, 7, 8, 9, 10];
  months.forEach((m, k) => {
    const d = (day: number) => toISO(2026, m, day);
    add(d(1), "Salary Income", 125000, H, { mainCategory: "Salary", description: "Monthly salary", paymentMethod: "NEFT", recurringOrOneTime: "Recurring" });
    add(d(3), "Household Expense", 25000, H, { mainCategory: "Housing", subCategory: "Rent", description: "House rent", essentialOrDiscretionary: "Essential", needOrWant: "Need", fixedOrVariable: "Fixed", recurringOrOneTime: "Recurring" });
    add(d(4), "Transfer Between Own Accounts", 10000, H, { toAccountId: C, description: "ATM withdrawal", paymentMethod: "Debit Card" });
    add(d(6), "Household Expense", 7800 + k * 350, H, { mainCategory: "Food", subCategory: "Groceries", description: "BigBasket groceries", essentialOrDiscretionary: "Essential", needOrWant: "Need", fixedOrVariable: "Variable" });
    add(d(8), "Household Expense", 3200 + (k % 3) * 400, H, { mainCategory: "Utilities", subCategory: "Electricity", description: "TNEB bill", paymentMethod: "Auto-Debit", essentialOrDiscretionary: "Essential" });
    add(d(10), "Investment Purchase", 10000, H, { mainCategory: "Investments", subCategory: "Mutual Fund SIP", description: "Nifty 50 index SIP", paymentMethod: "Auto-Debit" });
    add(d(14), "Daily Expense", 2800 + (k % 4) * 600, W, { mainCategory: "Food", subCategory: "Swiggy/Zomato", description: "Food delivery", essentialOrDiscretionary: "Discretionary", needOrWant: "Want" });
    add(d(16), "Daily Expense", 5200 + (k % 2) * 900, C, { mainCategory: "Transport", subCategory: "Fuel", description: "Petrol", paymentMethod: "Cash" });
    add(d(18), "Transfer Between Own Accounts", 3000, H, { toAccountId: W, description: "Wallet top-up" });
    add(d(20), "Daily Expense", 4500 + (k % 3) * 1500, H, { mainCategory: "Shopping", subCategory: "Clothes", description: "Myntra order", paymentMethod: "Credit Card", essentialOrDiscretionary: "Discretionary", needOrWant: "Want" });
  });
  add("2026-06-22", "Freelance Income", 20000, I, { mainCategory: "Freelance", description: "UI design project", paymentMethod: "NEFT" });
  add("2026-09-22", "Freelance Income", 25000, I, { mainCategory: "Freelance", description: "Website build", paymentMethod: "NEFT" });
  add("2026-07-12", "Business Expense", 5000, I, { mainCategory: "Business", subCategory: "Software", description: "Figma + hosting", personalOrBusiness: "Business" });
  add("2026-09-15", "Dividend/Investment Income", 2500, H, { mainCategory: "Dividend", description: "ITC dividend" });
  add("2026-08-24", "Refund Received", 1200, H, { mainCategory: "Shopping", subCategory: "Clothes", description: "Myntra return refund" });

  // Borrowing interest @2% of 5,00,000 = 10,000 per month. Sep period unpaid -> overdue.
  ["2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05", "2026-09-07"].forEach((d, k) =>
    add(d, "Interest Paid on Borrowing", 10000, H, { relatedBorrowingId: "BRW-001", relatedPerson: "Ramesh Kumar", mainCategory: "Interest", description: `Interest period ${k + 1}`, referenceNumber: `UPI${d.replace(/-/g, "")}` }));
  // Lending interest @2% of 2,00,000 = 4,000; partial in Aug, principal recovered 50,000.
  add("2026-06-10", "Interest Received from Money Lent", 4000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Interest" });
  add("2026-07-10", "Interest Received from Money Lent", 4000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Interest" });
  add("2026-08-11", "Interest Received from Money Lent", 2000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Interest", notes: "Part payment" });
  add("2026-08-20", "Principal Received from Borrower", 50000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Loans", description: "Part principal returned" });
  add("2026-09-12", "Interest Received from Money Lent", 4000, H, { relatedLendingId: "LND-001", relatedPerson: "Suresh Babu", mainCategory: "Interest" });

  const emiLoan = {
    loanId: "EMI-001", lender: "HDFC Bank", loanType: "Personal" as const, originalAmount: 600000, disbursementDate: "2026-04-05",
    annualRate: 11, tenureMonths: 36, emiStartDate: "2026-05-05", emiDay: 5, processingFee: 5900,
  };
  add("2026-04-05", "Business Expense", 5900, H, { mainCategory: "Business", subCategory: "Office", description: "Loan processing fee", relatedEmiId: "EMI-001" });
  add("2026-08-20", "Principal Repayment on Borrowing", 50000, H, { relatedEmiId: "EMI-001", relatedPerson: "HDFC Bank", mainCategory: "Loans", description: "EMI loan part-prepayment", paymentMethod: "NEFT" });
  for (let n = 1; n <= 6; n++) {
    const row = emiSchedule(emiLoan, txs).rows[n - 1];
    add(row.dueDate, "EMI Payment", row.emi, H, {
      relatedEmiId: "EMI-001", relatedPerson: "HDFC Bank", mainCategory: "EMI", description: `EMI ${n}/36`,
      interestComponent: row.interest, principalComponent: row.principal, paymentMethod: "Auto-Debit",
    });
  }

  const accounts = [
    { id: H, name: "HDFC Savings", type: "Savings" as const, openingBalance: 250000 },
    { id: I, name: "ICICI Current", type: "Current" as const, openingBalance: 50000 },
    { id: C, name: "Cash in Hand", type: "Cash in Hand" as const, openingBalance: 15000 },
    { id: W, name: "Paytm Wallet", type: "Digital Wallet" as const, openingBalance: 3000 },
  ];
  const hdfc = accountStatement(accounts[0], txs);
  (accounts[0] as { statementBalance?: number }).statementBalance = hdfc.closing - 1250; // demo discrepancy

  return {
    accounts,
    transactions: txs,
    borrowings: [{
      loanId: "BRW-001", kind: "BORROWED", counterparty: "Ramesh Kumar", contact: "98400 12345", purpose: "Home renovation",
      loanType: "Hand Loan", originalPrincipal: 500000, startDate: "2026-04-01", annualInterestRate: 24, monthlyInterestRate: 2,
      calculationMethod: "FIXED_MONTHLY_RATE", paymentFrequency: "Monthly", interestDueDay: 5, maturityDate: "2027-03-31",
      collateral: "Promissory note", agreementRef: "PN-2026-01",
    }],
    lendings: [{
      loanId: "LND-001", kind: "LENT", counterparty: "Suresh Babu", contact: "99620 54321", purpose: "Business working capital",
      loanType: "Hand Loan", originalPrincipal: 200000, startDate: "2026-05-10", annualInterestRate: 24, monthlyInterestRate: 2,
      calculationMethod: "FIXED_MONTHLY_RATE", paymentFrequency: "Monthly", interestDueDay: 10, maturityDate: "2027-05-10",
      collateral: "Gold 40g", agreementRef: "AGR-LND-01",
    }],
    emiLoans: [emiLoan],
    budgets: [
      { id: "BUD-1", category: "Food", monthlyLimit: 12000 },
      { id: "BUD-2", category: "Shopping", monthlyLimit: 6000 },
      { id: "BUD-3", category: "Transport", monthlyLimit: 6000 },
    ],
    assets: [{ id: "AST-1", name: "Gold jewellery", type: "Gold", currentValue: 150000 }],
    obligations: [],
    goals: [{ id: "GOAL-1", name: "Emergency fund", target: 300000, saved: 120000, targetDate: "2027-03-31" }],
    config: defaultConfig(),
  };
}
