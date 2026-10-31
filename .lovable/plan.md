# Bank sync, statements and portable backups

## What you get
- **Bank Sync:** CSV/XLS/XLSX upload and SMS/UPI paste, automatic column/narration parsing, persistent staging inbox, duplicate protection, editable loan/category suggestions and remembered merchant rules. Only approved rows reach the transaction register.
- **Planning:** Expense filters and monthly budgets; assets and monthly net worth; operating versus financing cash flow; commitments across 7/15/30/60/90 days; April–March annual comparison; goals and emergency fund planning.
- **Settings:** Editable master lists, nine-scenario accounting audit, full JSON backup/restore and full 15-sheet Excel export/import with preview before replacement.

## Safety and verification
- Preserve existing accounting calculations and loan history. Suggestions never alter imported amounts.
- Validate loan links, EMI splits, principal limits and duplicates before committing approvals together.
- Run accounting/parser/report/backup tests and exercise import → review → approve → register, plus workbook round-trip.

## Technical details
- Keep browser-local persistence; add separate persisted staging/rule state included in backups.
- Extend the central accounting engine with derived statement helpers, without changing existing formulas.
- Use SheetJS for bank files and portable workbook reads/writes; retain ISO dates internally and Indian display formatting.
- Workbook sheets: Transactions, Accounts, Borrowings, Lending, EMI Loans, Interest Ledger, Principal Movements, EMI Schedule, Budgets, Assets, Obligations, Goals, Configuration, Monthly Summary, Bank Inbox (including import rules and full-state metadata).