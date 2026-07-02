import { describe, expect, test } from "bun:test";
import {
  PlatformRechargeOrderQuerySchema,
  PlatformRechargeProductCreateSchema,
  PlatformRechargeProductParamSchema,
  PlatformRechargeProductQuerySchema,
  PlatformRechargeProductUpdateSchema,
} from "./platform-billing-recharge";

describe("platform billing recharge schemas", () => {
  test("accepts paginated recharge product query", () => {
    const result = PlatformRechargeProductQuerySchema.parse({
      page: "2",
      pageSize: "50",
      enabled: "true",
    });

    expect(result).toEqual({ page: 2, pageSize: 50, enabled: true });
  });

  test("accepts create and update product payloads", () => {
    const createResult = PlatformRechargeProductCreateSchema.parse({
      code: "credit_1000",
      title: "1000 积分",
      amount_fen: "10000",
      credits: "1000",
      bonus_credits: "100",
      enabled: true,
      sort_order: "10",
      metadata: { badge: "推荐" },
    });
    const updateResult = PlatformRechargeProductUpdateSchema.parse({
      title: "1000 积分套餐",
      enabled: false,
    });

    expect(createResult.amount_fen).toBe(10000);
    expect(createResult.credits).toBe(1000);
    expect(updateResult).toEqual({
      title: "1000 积分套餐",
      enabled: false,
    });
  });

  test("rejects unknown product payload fields", () => {
    expect(() =>
      PlatformRechargeProductCreateSchema.parse({
        code: "credit_1000",
        title: "1000 积分",
        amount_fen: 10000,
        credits: 1000,
        unsafe: true,
      })
    ).toThrow();
  });

  test("accepts product id params and order filters", () => {
    const params = PlatformRechargeProductParamSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
    });
    const query = PlatformRechargeOrderQuerySchema.parse({
      page: "1",
      pageSize: "20",
      status: "paid",
      keyword: "TC202607",
    });

    expect(params.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(query.status).toBe("paid");
    expect(query.keyword).toBe("TC202607");
  });
});
