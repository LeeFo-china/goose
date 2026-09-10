import { describe, expect, test } from "bun:test";

import {
  DouyinCustomerAuthAuthorizeSchema,
  DouyinCustomerAuthSelectSchema,
  DouyinCustomerAuthSendCodeSchema,
  DouyinCustomerAuthVerifySchema,
} from "./douyin-customer-auth";

describe("douyin customer auth schemas", () => {
  test("accepts exact request bodies", () => {
    expect(DouyinCustomerAuthSendCodeSchema.parse({ phone: "13800138000" }))
      .toEqual({ phone: "13800138000" });
    expect(DouyinCustomerAuthVerifySchema.parse({
      phone: "13800138000",
      code: "123456",
    })).toEqual({ phone: "13800138000", code: "123456" });
    expect(DouyinCustomerAuthAuthorizeSchema.parse({
      douyin_phone_code: "official-phone-code",
    })).toEqual({ douyin_phone_code: "official-phone-code" });
    expect(DouyinCustomerAuthSelectSchema.parse({
      selection_token: "A".repeat(43),
      candidate_id: "11111111-1111-4111-8111-111111111111",
    }).candidate_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects client supplied tenant and customer ids", () => {
    for (const body of [
      { phone: "13800138000", tenant_id: crypto.randomUUID() },
      { phone: "13800138000", code: "123456", customer_id: crypto.randomUUID() },
      { douyin_phone_code: "official-phone-code", target_mode: "employee" },
      {
        selection_token: "A".repeat(43),
        candidate_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
      },
    ]) {
      const result = "douyin_phone_code" in body
        ? DouyinCustomerAuthAuthorizeSchema.safeParse(body)
        : "selection_token" in body
          ? DouyinCustomerAuthSelectSchema.safeParse(body)
          : "code" in body
            ? DouyinCustomerAuthVerifySchema.safeParse(body)
            : DouyinCustomerAuthSendCodeSchema.safeParse(body);
      expect(result.success).toBe(false);
    }
  });
});
