import test from "node:test";
import assert from "node:assert/strict";
import { customCreditQuote } from "../shared/credit-purchase.ts";
const limits = { minAmount: 500, maxAmount: 100000 };
test("custom purchases use 20 credits per pound with whole credits and bounded spend", () => {
  for (const [amount, credits] of [[500,100],[505,101],[2000,400],[2500,500],[100000,20000]]) assert.equal(customCreditQuote(amount, limits), credits);
  for (const amount of [0,499,501,500.5,100005,NaN,Infinity]) assert.equal(customCreditQuote(amount, limits), null);
});
