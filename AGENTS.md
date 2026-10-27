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
