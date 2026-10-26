export type Nature = "INCOME" | "EXPENSE" | "LIABILITY" | "ASSET" | "EMI" | "NEUTRAL" | "REFUND";
export type Direction = "IN" | "OUT" | "TRANSFER";
export type Link = "borrowing" | "lending" | "emi" | "borrowing_or_emi" | "asset";

export const TX_TYPES = [
  { type: "Salary Income", dir: "IN", nature: "INCOME" },
  { type: "Business Income", dir: "IN", nature: "INCOME" },
  { type: "Freelance Income", dir: "IN", nature: "INCOME" },
  { type: "Rental Income", dir: "IN", nature: "INCOME" },
  { type: "Dividend/Investment Income", dir: "IN", nature: "INCOME" },
  { type: "Other Income", dir: "IN", nature: "INCOME" },
  { type: "Daily Expense", dir: "OUT", nature: "EXPENSE" },
  { type: "Household Expense", dir: "OUT", nature: "EXPENSE" },
  { type: "Business Expense", dir: "OUT", nature: "EXPENSE" },
  { type: "Interest Paid on Borrowing", dir: "OUT", nature: "EXPENSE", link: "borrowing" },
  { type: "Principal Repayment on Borrowing", dir: "OUT", nature: "LIABILITY", link: "borrowing_or_emi" },
  { type: "EMI Payment", dir: "OUT", nature: "EMI", link: "emi" },
  { type: "Interest Received from Money Lent", dir: "IN", nature: "INCOME", link: "lending" },
  { type: "Principal Received from Borrower", dir: "IN", nature: "ASSET", link: "lending" },
  { type: "Money Borrowed", dir: "IN", nature: "LIABILITY", link: "borrowing_or_emi" },
  { type: "Money Lent to Another Person", dir: "OUT", nature: "ASSET", link: "lending" },
  { type: "Transfer Between Own Accounts", dir: "TRANSFER", nature: "NEUTRAL" },
  { type: "Investment Purchase", dir: "OUT", nature: "ASSET", link: "asset" },
  { type: "Investment Sale", dir: "IN", nature: "ASSET", link: "asset" },
  { type: "Asset Purchase", dir: "OUT", nature: "ASSET", link: "asset" },
  { type: "Asset Sale", dir: "IN", nature: "ASSET", link: "asset" },
  { type: "Refund Received", dir: "IN", nature: "REFUND" },
] as const satisfies readonly { type: string; dir: Direction; nature: Nature; link?: Link }[];

export type TxType = (typeof TX_TYPES)[number]["type"];
export const txMeta = (t: string) =>
  (TX_TYPES as readonly { type: string; dir: Direction; nature: Nature; link?: Link }[]).find((x) => x.type === t)!;

export const PAYMENT_METHODS = ["UPI", "NEFT", "IMPS", "RTGS", "Cash", "Debit Card", "Credit Card", "Cheque", "Auto-Debit"] as const;
export const ACCOUNT_TYPES = ["Savings", "Current", "Cash in Hand", "Digital Wallet"] as const;

export interface Account {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  openingBalance: number;
  statementBalance?: number;
  statementDate?: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO; displayed DD-MM-YYYY
  month: number;
  year: number;
  financialYear: string;
  type: TxType;
  mainCategory: string;
  subCategory: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  paymentMethod: string;
  amount: number;
  direction: Direction;
  relatedPerson?: string;
  relatedBorrowingId?: string;
  relatedLendingId?: string;
  relatedEmiId?: string;
  relatedAssetId?: string;
  interestComponent?: number; // EMI split
  principalComponent?: number; // EMI split
  essentialOrDiscretionary?: "Essential" | "Discretionary";
  recurringOrOneTime?: "Recurring" | "One-time";
  needOrWant?: "Need" | "Want";
  personalOrBusiness?: "Personal" | "Business";
  fixedOrVariable?: "Fixed" | "Variable";
  referenceNumber?: string;
  notes?: string;
  source: "Manual" | "Bank Import" | "Auto-Rule";
}

export type CalcMethod = "FIXED_MONTHLY_RATE" | "ANNUAL_DIV_12" | "DAILY_ACTUAL" | "MANUAL_AMOUNT";
export type LoanStatus = "ACTIVE" | "OVERDUE" | "CLOSED";

/** Shared shape for interestOnlyBorrowings (kind BORROWED) and moneyLentReceivables (kind LENT). */
export interface PrivateLoan {
  loanId: string;
  kind: "BORROWED" | "LENT";
  counterparty: string; // lenderName or borrowerName
  contact?: string;
  description?: string;
  purpose?: string;
  loanType?: string;
  originalPrincipal: number; // originalAmountLent for LENT
  startDate: string;
  annualInterestRate: number;
  monthlyInterestRate: number;
  calculationMethod: CalcMethod;
  manualInterestAmount?: number;
  paymentFrequency: "Monthly";
  interestDueDay: number;
  maturityDate?: string; // agreedRepaymentDate for LENT
  expectedSettlementDate?: string;
  actualSettlementDate?: string;
  collateral?: string;
  agreementRef?: string;
  notes?: string;
}

export interface EmiLoan {
  loanId: string;
  lender: string;
  loanType: "Home" | "Personal" | "Vehicle" | "Business" | "Education" | "Consumer";
  originalAmount: number;
  disbursementDate: string;
  annualRate: number;
  tenureMonths: number;
  emiStartDate: string;
  emiDay: number;
  processingFee: number;
  overrides?: Record<number, { interest: number; principal: number }>;
}

export interface Budget { id: string; category: string; monthlyLimit: number }
export interface Asset { id: string; name: string; type: string; currentValue: number }
export interface Obligation { id: string; name: string; amount: number; dueDay: number }
export interface Goal { id: string; name: string; target: number; saved: number; targetDate?: string }
export interface MasterConfig {
  expenseCategories: Record<string, string[]>;
  incomeCategories: string[];
  paymentMethods: string[];
  people: string[];
}

export interface DB {
  accounts: Account[];
  transactions: Transaction[];
  borrowings: PrivateLoan[];
  lendings: PrivateLoan[];
  emiLoans: EmiLoan[];
  budgets: Budget[];
  assets: Asset[];
  obligations: Obligation[];
  goals: Goal[];
  config: MasterConfig;
}
