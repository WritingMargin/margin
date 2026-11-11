export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 100 ? 2 : 0,
  }).format(amount / 100);
