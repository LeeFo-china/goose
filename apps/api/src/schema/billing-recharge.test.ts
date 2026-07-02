import { describe, expect, test } from "bun:test";
import {
  BillingRechargeCreateOrderSchema,
  BillingRechargeOrderParamSchema,
  BillingRechargeProductQuerySchema,
} from "./billing-recharge";

describe("billing recharge schemas", () => {
  test("accepts paginated product query", () => {
    const result = BillingRechargeProductQuerySchema.safeParse({
      page: "1",
      pageSize: "20",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ page: 1, pageSize: 20 });
  });

  test("rejects client supplied credits", () => {
    const result = BillingRechargeCreateOrderSchema.safeParse({
      package_code: "credit_1000",
      payer_openid: "openid-1",
      credits: 999999,
    });

    expect(result.success).toBe(false);
  });

  test("accepts package code, payer openid and idempotency key", () => {
    const result = BillingRechargeCreateOrderSchema.safeParse({
      package_code: "credit_1000",
      payer_openid: "openid-1",
      idempotency_key: "018f5f06-2bf8-71dc-91f6-f5c8547d9f7b",
    });

    expect(result.success).toBe(true);
  });

  test("accepts recharge order id param", () => {
    const result = BillingRechargeOrderParamSchema.safeParse({
      id: "018f5f06-2bf8-71dc-91f6-f5c8547d9f7b",
    });

    expect(result.success).toBe(true);
  });
});
