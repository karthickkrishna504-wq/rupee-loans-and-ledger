# Rupee Loans And Ledger

Act as a Principal FinTech Architect, Senior Full-Stack Engineer, and Indian Personal Finance ERP Designer.



Build a comprehensive, production-grade **Personal Finance & Private Lending ERP Web Application (PWA)** tailored for India. 

- **Tech Stack:** React, TypeScript, Tailwind CSS, Lucide Icons, Recharts, and a persistent state/database layer (use Supabase/PostgreSQL if connected, plus complete LocalStorage + JSON/Excel backup persistence so the app works 100% immediately out-of-the-box).

- **Indian Localization:** Strictly use Indian Rupees (`₹`), the Indian numbering system (`en-IN` locale: Lakhs and Crores, e.g., `₹5,00,000`), Indian Date Format (`DD-MM-YYYY`), and Indian Financial Year (`1 April to 31 March`, e.g., `FY 2026-27`).

- **Design Aesthetic:** Ultra-clean, modern dark/light mode FinTech aesthetic inspired by **Fold Money** and **Linear**. High-contrast status badges, sticky table headers, quick filters, and mobile-responsive bottom/sidebar navigation.



---



## 1. MANDATORY ACCOUNTING & FINANCIAL MODELLING ENGINE (NON-NEGOTIABLE)

Implement a centralized Accounting & Reconciliation Engine (`src/lib/accountingEngine.ts`) that enforces these exact rules across all dashboards and registers:



1. **Borrowing Money (Liability Creation):** Increases Cash/Bank balance and increases Liabilities. It is **NEVER** counted as Income.

2. **Lending Money (Receivable Creation):** Reduces Cash/Bank balance and increases Principal Receivable (Asset). It is **NEVER** counted as an Expense.

3. **Repaying Principal on Borrowing:** Reduces Cash/Bank balance and reduces the Loan's Outstanding Principal. It is **NEVER** counted as an ordinary Expense.

4. **Recovering Principal from Borrower:** Increases Cash/Bank balance and reduces the Loan's Outstanding Principal Receivable. It is **NEVER** counted as Income.

5. **Interest Paid on Borrowing:** Reduces Cash/Bank balance and **IS** counted as an Expense (`Interest Paid`). It NEVER reduces the loan's principal.

6. **Interest Received from Borrower:** Increases Cash/Bank balance and **IS** counted as Income (`Interest Received`) ONLY when actually received (accrued/expected interest is tracked separately and never counted as realized income until paid). It NEVER reduces the borrower's principal.

7. **EMI Payments:** Every EMI payment must split into two components:

   - `Interest Component` -> Counted as Expense.

   - `Principal Component` -> Reduces EMI Loan Outstanding Principal (Liability), NOT counted as an ordinary Expense.

8. **Internal Account Transfers:** Transfers between own Bank/Cash/Wallet accounts reduce the source account and increase the destination account with **zero impact** on Income or Expenses.

9. **Asset / Investment Purchases & Sales:** Buying Mutual Funds, Shares, Gold, or Real Estate converts Cash/Bank into an Asset (not a consumption expense).

10. **Refunds:** Linked to the original expense category to offset actual spending rather than inflating income.



---



## 2. DATABASE SCHEMA & STATE ARCHITECTURE

Create strongly-typed data structures and full CRUD operations for:

1. `accounts`: ID, Name, Type (Savings, Current, Cash in Hand, Digital Wallet), Opening Balance, Current Calculated Balance, Statement Balance (for reconciliation), Unexplained Variance.

2. `transactions` (Master Daily Transaction Register):

   - Fields: `id`, `date` (DD-MM-YYYY), `month`, `year`, `financialYear`, `type` (20+ strict types below), `mainCategory`, `subCategory`, `description`, `accountId`, `toAccountId` (for transfers), `paymentMethod` (UPI, NEFT, IMPS, RTGS, Cash, Debit Card, Credit Card, Cheque, Auto-Debit), `amount`, `direction` (IN / OUT / TRANSFER), `relatedPerson`, `relatedBorrowingId`, `relatedLendingId`, `relatedEmiId`, `relatedAssetId`, `essentialOrDiscretionary`, `recurringOrOneTime`, `needOrWant`, `personalOrBusiness`, `fixedOrVariable`, `referenceNumber` (UTR/Receipt), `notes`, `source` (Manual / Bank Import / Auto-Rule).

   - **Transaction Types:** Salary Income, Business Income, Freelance Income, Rental Income, Dividend/Investment Income, Other Income, Daily Expense, Household Expense, Business Expense, Interest Paid on Borrowing, Principal Repayment on Borrowing, EMI Payment (with Principal + Interest split), Interest Received from Money Lent, Principal Received from Borrower, Money Borrowed (New/Top-up), Money Lent to Another Person (New/Top-up), Transfer Between Own Accounts, Investment Purchase, Investment Sale, Asset Purchase, Asset Sale, Refund Received.

3. `interestOnlyBorrowings` (Loans Taken):

   - Fields: `loanId`, `lenderName`, `contact`, `description`, `purpose`, `loanType`, `originalPrincipal`, `additionalBorrowed`, `principalRepaid`, `outstandingPrincipal`, `startDate`, `annualInterestRate`, `monthlyInterestRate` (e.g., 2% per month), `calculationMethod` ('FIXED_MONTHLY_RATE' | 'ANNUAL_DIV_12' | 'DAILY_ACTUAL' | 'MANUAL_AMOUNT'), `paymentFrequency`, `interestDueDay` (1–31), `maturityDate`, `expectedSettlementDate`, `actualSettlementDate`, `collateral`, `agreementRef`, `status` ('ACTIVE' | 'OVERDUE' | 'CLOSED'), `notes`.

4. `moneyLentReceivables` (Loans Given to Others):

   - Mirrors `interestOnlyBorrowings` for borrowers: tracks `originalAmountLent`, `additionalLent`, `principalRecovered`, `outstandingPrincipal`, `monthlyInterestRate` (e.g., 2%/month), `interestDueDay`, `agreedRepaymentDate`, `collateral`, `status` ('ACTIVE' | 'OVERDUE' | 'CLOSED').

5. `interestLedger` (Accrual & Payment History for Both Borrowings & Lending):

   - Tracks each period's `periodStart`, `periodEnd`, `dueDate`, `openingPrincipal`, `applicableRate`, `interestAccrued`, `amountPaidOrReceived`, `balancePayableOrReceivable`, `paymentDate`, `reference`, `status` ('UPCOMING' | 'DUE_TODAY' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'CLOSED').

6. `principalMovements` (Principal Repayment & Settlement Register):

   - Tracks `transactionId`, `date`, `loanId`, `direction` ('BORROWED' | 'LENT'), `personName`, `openingPrincipal`, `additionalPrincipal`, `principalSettled`, `closingPrincipal`, `settlementType` ('Full Settlement' | 'Partial Principal Repayment' | 'Additional Borrowing/Lending' | 'Refinancing' | 'Write-off'), `accountId`, `reference`.

7. `emiLoans` & `emiSchedule`:

   - Loan fields: `loanId`, `lender`, `loanType` (Home, Personal, Vehicle, Business, Education, Consumer), `originalAmount`, `disbursementDate`, `annualRate`, `tenureMonths`, `emiStartDate`, `emiDay`, `contractualEmi`, `processingFee`, `currentOutstanding`, `status`.

   - Dynamic PMT/IPMT/PPMT Amortization generator supporting **Additional Principal Prepayments** (automatically recalculating closing balance and remaining tenure) and **Manual Bank Split Overrides**.

8. `budgets`, `assets`, `obligations`, `financialGoals`, and `masterConfig` (editable categories for Personal/Household & Business expenses, lenders, borrowers, payment methods).



---



## 3. BUILD PHASE 1 SCREENS (FULLY FUNCTIONAL, ZERO HARDCODED DUMMY METRICS)

Build a clean sidebar navigation with the following live modules first:

1. **Executive Dashboard:**

   - Month & Year selector + Financial Year selector (`All`, `Oct 2026`, `FY 2026-27`, etc.).

   - **16 Summary Cards:** Total Income, Total Expenses, Monthly Savings, Savings Rate %, Total Outstanding Borrowings, Total Outstanding Principal Lent, Interest Paid (Month), Interest Received (Month), EMI Payments (Month), Total Monthly Debt Obligations, Cash & Bank Balances, Net Worth, Overdue Receivables, Overdue Payables, Upcoming EMIs, Net Interest Cash Flow.

   - **10 Interactive Charts** (Income vs Expense, Savings Trend, Category Expense Pie, Borrowings by Lender, Lending by Borrower, Interest Paid vs Received, 12-Month EMI Commitments, Cash Inflow vs Outflow, Assets vs Liabilities, Debt Repayment Progress).

   - **8 Financial Health Indicators** with Healthy (Green), Caution (Amber), and Critical (Red) badges.

2. **Daily Transaction Register & Smart Entry Modal:**

   - Full filterable, searchable register with all 21 columns.

   - Smart Transaction Form: When the user selects `Interest Paid on Borrowing` or `Principal Repayment on Borrowing`, dynamically show the `Loan ID` dropdown, auto-fill the Lender and expected amount, and automatically update the linked loan's ledger and Bank Account balance upon saving!

3. **Bank Accounts & Cash Management:**

   - Live calculation of Opening Balance + Inflows - Outflows + Transfers = Closing Balance, plus a Bank Statement Reconciliation comparator that flags unexplained discrepancies.

4. **Validation Seed Data Loader:**

   - Include a toggleable "Load Validation Test Data / Clear All Data" utility in Settings so I can immediately see how the₹5,00,000 @ 2%/month borrowing, ₹2,00

,000 @ 2%/month lending, and EMI amortization work in action.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rupee-loans-and-ledger.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ae92b764-58f6-5953-9c42-c10f3f4d1f99).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
