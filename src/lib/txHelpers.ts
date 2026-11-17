import { getDB, removeItem, setDB, upsert } from "./store";
import { interestLedger } from "./accountingEngine";
import type { Account, DB, PrivateLoan, Transaction, TxType } from "./types";

/** Payment methods a given account can legitimately use. Cash accounts cannot do UPI/NEFT etc. */
export function methodsForAccount(acc?: Account): readonly string[] {
  if (!acc) return [];
  if (acc.type === "Cash in Hand") return ["Cash"];
  if (acc.type === "Digital Wallet") return ["UPI", "Debit Card", "Cash"];
  return ["UPI", "NEFT", "IMPS", "RTGS", "Debit Card", "Credit Card", "Cheque", "Auto-Debit"];
}

/** One shared auto-description template for loan-linked interest entries. */
export const loanInterestDescription = (loan: PrivateLoan, period: number) =>
  `Interest · ${loan.counterparty} · P${period}`;

/** Which ledger period does an interest payment on this loan cover, given payments already recorded? */
export function periodForInterestDate(loan: PrivateLoan, txs: Transaction[], date: string): number {
  const today = date;
  const rows = interestLedger(loan, txs, today).filter((r) => r.status === "PAID" || r.status === "PARTIAL" || r.dueDate <= date);
  const last = rows.filter((r) => r.amountPaidOrReceived > 0).at(-1);
  return (last?.period ?? 0) + 1;
}

/** Delete an interest entry and re-open its loan period. The ledger recomputes from remaining transactions. */
export function deleteLoanTx(t: Transaction) {
  removeItem("transactions", t.id);
  return t;
}

/** Editable mirror of the loan-linked entry; upsert keeps the ledger consistent because allocation is derived. */
export function saveLoanTx(t: Transaction) {
  upsert("transactions", t);
}

export function accountById(db: DB, id?: string) {
  return db.accounts.find((a) => a.id === id);
}

export type { TxType };
