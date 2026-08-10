import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";

import {
  ServiceOrderCancelSchema,
  ServiceOrderActionSchema,
  ServiceOrderCreateSchema,
  ServiceOrderListQuerySchema,
  ServiceProductListQuerySchema,
  ServiceAcceptanceDecisionSchema,
  ServiceRefundRequestSchema,
} from "./billing-service-orders";

describe("billing service order schemas", () => {
  test("defaults product list pagination", () => {
    expect(ServiceProductListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  test("rejects page sizes above the list boundary", () => {
    expect(ServiceProductListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
  });

  test("accepts service order creation without client-controlled amount", () => {
    expect(ServiceOrderCreateSchema.safeParse({
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: randomUUID(),
    }).success).toBe(true);
  });

  test("rejects service order creation with client-controlled amount", () => {
    expect(ServiceOrderCreateSchema.safeParse({
      product_code: "platform_service_1y",
      terms_version: 1,
      terms_accepted: true,
      idempotency_key: randomUUID(),
      amount_fen: 1,
    }).success).toBe(false);
  });

  test("parses strict order list filters and actions", () => {
    expect(ServiceOrderListQuerySchema.parse({
      paymentStatus: "pending",
      serviceStatus: "waiting_payment",
      keyword: "TSO",
    })).toMatchObject({
      page: 1,
      pageSize: 20,
      paymentStatus: "pending",
      serviceStatus: "waiting_payment",
      keyword: "TSO",
    });
    expect(ServiceOrderActionSchema.safeParse({
      expected_version: 1,
      idempotency_key: randomUUID(),
    }).success).toBe(true);
    expect(ServiceRefundRequestSchema.safeParse({
      expected_version: 1,
      idempotency_key: randomUUID(),
      reason: "未开始实施",
    }).success).toBe(true);
  });

  test("parses a strict idempotent pending order cancellation", () => {
    expect(ServiceOrderCancelSchema.parse({
      expected_version: 3,
      idempotency_key: randomUUID(),
      reason: "user_changed_product",
    })).toMatchObject({
      expected_version: 3,
      reason: "user_changed_product",
    });
    expect(ServiceOrderCancelSchema.parse({
      expected_version: 3,
      idempotency_key: randomUUID(),
    }).reason).toBe("user_cancelled");
    expect(ServiceOrderCancelSchema.safeParse({
      expected_version: 3,
      idempotency_key: randomUUID(),
      reason: "arbitrary text",
    }).success).toBe(false);
  });

  test("parses customer acceptance decisions without idempotency or amount", () => {
    expect(ServiceAcceptanceDecisionSchema.parse({
      expected_work_order_version: 5,
      remark: "确认验收通过",
    })).toEqual({
      expected_work_order_version: 5,
      remark: "确认验收通过",
    });
    expect(ServiceAcceptanceDecisionSchema.safeParse({
      expected_work_order_version: 0,
      remark: "确认验收通过",
    }).success).toBe(false);
    expect(ServiceAcceptanceDecisionSchema.safeParse({
      expected_work_order_version: 5,
      remark: "x".repeat(501),
    }).success).toBe(false);
    expect(ServiceAcceptanceDecisionSchema.safeParse({
      expected_work_order_version: 5,
      amount_fen: 1,
    }).success).toBe(false);
  });
});
