import { z } from "zod";
import { TX_TYPES, txMeta, type MasterConfig } from "./types";

const types = TX_TYPES.map((t) => t.type) as [typeof TX_TYPES[number]["type"], ...typeof TX_TYPES[number]["type"][]];
export const suggestionSchema = z.object({
  type: z.enum(types),
  mainCategory: z.string(), subCategory: z.string(),
  personalOrBusiness: z.enum(["Personal", "Business"]).nullable(),
  essentialOrDiscretionary: z.enum(["Essential", "Discretionary"]).nullable(),
  needOrWant: z.enum(["Need", "Want"]).nullable(),
  recurringOrOneTime: z.enum(["Recurring", "One-time"]).nullable(),
  fixedOrVariable: z.enum(["Fixed", "Variable"]).nullable(),
}).strict();
export type TransactionSuggestion = z.infer<typeof suggestionSchema>;

export function validateSuggestion(input: unknown, config: MasterConfig) {
  const s = suggestionSchema.parse(input);
  const nature = txMeta(s.type).nature;
  const expense = nature === "EXPENSE" || nature === "REFUND";
  const categories = expense ? Object.keys(config.expenseCategories) : nature === "INCOME" ? config.incomeCategories : ["Loans", "EMI", "Interest", "Investments", "Assets", "Transfers"];
  if (s.mainCategory && !categories.includes(s.mainCategory)) s.mainCategory = "";
  if (!expense || !(config.expenseCategories[s.mainCategory] ?? []).includes(s.subCategory)) s.subCategory = "";
  return s;
}