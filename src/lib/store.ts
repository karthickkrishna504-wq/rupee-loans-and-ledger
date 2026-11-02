import { useSyncExternalStore } from "react";
import { deriveDateFields } from "./accountingEngine";
import { txMeta, type DB, type Transaction } from "./types";
import { buildSeed, defaultConfig } from "./seed";

const KEY = "finledger-erp-v1";
const SEEDED = "finledger-erp-seeded";

export const emptyDB = (): DB => ({
  accounts: [], transactions: [], borrowings: [], lendings: [], emiLoans: [],
  budgets: [], assets: [], obligations: [], goals: [], config: defaultConfig(),
  bankSync: { rows: [], rules: [] },
});

const SERVER: DB = emptyDB();
let state: DB | null = null;
const listeners = new Set<() => void>();

function load(): DB {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...emptyDB(), ...JSON.parse(raw) };
    else if (!localStorage.getItem(SEEDED)) { state = buildSeed(); localStorage.setItem(SEEDED, "1"); persist(); }
    else state = emptyDB();
  } catch { state = emptyDB(); }
  return state ?? emptyDB();
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ } }

export function setDB(next: DB | ((d: DB) => DB)) {
  state = typeof next === "function" ? next(load()) : next;
  persist();
  listeners.forEach((l) => l());
}
export const getDB = () => load();

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => load(),
    () => SERVER,
  );
}

export const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

type ListKey = Exclude<keyof DB, "config" | "bankSync">;
export function upsert<K extends ListKey>(key: K, item: DB[K][number], idField: string = "id") {
  setDB((d) => {
    const list = d[key] as unknown as Record<string, unknown>[];
    const it = item as unknown as Record<string, unknown>;
    const i = list.findIndex((x) => x[idField] === it[idField]);
    const next = i >= 0 ? list.map((x, j) => (j === i ? it : x)) : [...list, it];
    return { ...d, [key]: next };
  });
}
export function removeItem<K extends ListKey>(key: K, id: string, idField: string = "id") {
  setDB((d) => ({ ...d, [key]: (d[key] as unknown as Record<string, unknown>[]).filter((x) => x[idField] !== id) }));
}

/** Normalises a transaction (derived date fields + direction) before saving. */
export function normaliseTx(t: Omit<Transaction, "month" | "year" | "financialYear" | "direction"> & Partial<Transaction>): Transaction {
  return { ...t, ...deriveDateFields(t.date), direction: txMeta(t.type).dir } as Transaction;
}
export const saveTx = (t: Transaction) => upsert("transactions", normaliseTx(t));

export const loadValidationData = () => setDB(buildSeed());
export const clearAll = () => setDB(emptyDB());
