export type CreditPurchase = { id: string; fulfilled: boolean; credits: number; amount: number; currency: "gbp" };
export function customCreditQuote(amount: number, limits: { minAmount: number; maxAmount: number }) {
  if (!Number.isSafeInteger(amount) || amount < limits.minAmount || amount > limits.maxAmount || amount % 5 !== 0) return null;
  return amount / 5;
}
