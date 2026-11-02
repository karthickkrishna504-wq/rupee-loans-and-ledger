<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All money figures derive from `src/lib/accountingEngine.ts` over the transactions list; never store computed balances/outstanding — keeps every screen consistent with the accounting rules.
- Data persists in localStorage via `src/lib/store.ts` (`useDB`, `upsert`, `saveTx`); dates stored ISO, displayed DD-MM-YYYY via `src/lib/format.ts`.
- Accounting rules are covered by `src/test/accounting.test.ts`; update it when rules change.
- Dashboard tabs only partition presentation; calculations and portfolio metrics stay derived from the existing engine.
- Global Quick Entry reuses TransactionDialog and saveTx so every entry retains the same validations and ledger normalization.
- AI classification is advisory through a server function, constrained to existing transaction types/categories and classification fields; it never saves entries or changes money values.
- Bank staging and merchant rules live in the same local DB backup; bulk approval validates links, directions, splits, principal limits and fingerprints before updating transactions and inbox together.
- Financial statements extend the central engine with pure derived helpers; historical transaction cutoffs are applied before portfolio calculations and market estimates are not treated as historical snapshots.
- Portable workbooks use named source sheets and JSON-encoded nested fields; derived ledger sheets are read-only exports and imports validate all source data before explicit replacement.
