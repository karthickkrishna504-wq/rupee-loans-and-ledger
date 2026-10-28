import { describe, expect, it } from "vitest";
import { validateSuggestion } from "../lib/transactionSuggestion";
const config = { expenseCategories: { Utilities: ["Internet"] }, incomeCategories: ["Salary"], people: [], paymentMethods: [] };
const draft = { type: "Business Expense", mainCategory: "Utilities", subCategory: "Internet", personalOrBusiness: "Business", essentialOrDiscretionary: "Essential", needOrWant: "Need", recurringOrOneTime: "Recurring", fixedOrVariable: "Fixed" };
describe("Advisory transaction classification", () => {
  it("keeps existing business classification fields", () => { expect(validateSuggestion(draft, config).personalOrBusiness).toBe("Business"); });
  it("rejects invented transaction types", () => { expect(() => validateSuggestion({ ...draft, type: "Debt Income" }, config)).toThrow(); });
  it("removes categories absent from the configured list", () => { expect(validateSuggestion({ ...draft, mainCategory: "Invented" }, config).mainCategory).toBe(""); });
  it("rejects new data fields such as amounts or freeform tags", () => { expect(() => validateSuggestion({ ...draft, amount: 1200, tags: ["Office"] }, config)).toThrow(); });
});