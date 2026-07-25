import { describe, expect, test } from "bun:test";
import {
  CreateCustomerWechatPaySmokeOrderSchema,
} from "./customer-wechat-pay-smoke";

describe("customer wechat pay smoke schemas", () => {
  test("accepts payer openid only", () => {
    const result = CreateCustomerWechatPaySmokeOrderSchema.safeParse({
      payer_openid: "  o-customer-openid  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      payer_openid: "o-customer-openid",
    });
  });

  test("rejects client supplied amount", () => {
    const result = CreateCustomerWechatPaySmokeOrderSchema.safeParse({
      payer_openid: "o-customer-openid",
      amount: 100,
    });

    expect(result.success).toBe(false);
  });
});
