import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";

import {
  PlatformServiceProductActionSchema,
  PlatformServiceProductDraftSchema,
  PlatformServiceProductListQuerySchema,
  PlatformServiceProductUpdateSchema,
} from "./platform-service-products";

const draftInput = {
  code: "platform_service_custom",
  title: "平台部署及年度技术服务",
  term_years: 1,
  list_amount_fen: 980000,
  amount_fen: 980000,
  service_scope: ["客户专属系统环境部署"],
  terms_content: "服务条款",
};

describe("platform service product schemas", () => {
  test("defaults list pagination and caps page size", () => {
    expect(PlatformServiceProductListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(PlatformServiceProductListQuerySchema.safeParse({ pageSize: 101 })
      .success).toBe(false);
  });

  test("accepts a product draft with integer fen prices", () => {
    expect(PlatformServiceProductDraftSchema.safeParse(draftInput).success)
      .toBe(true);
  });

  test("rejects actual sale price above list price", () => {
    const result = PlatformServiceProductDraftSchema.safeParse({
      ...draftInput,
      amount_fen: draftInput.list_amount_fen + 1,
    });

    expect(result.success).toBe(false);
  });

  test("does not persist discount as independent truth", () => {
    expect(PlatformServiceProductDraftSchema.safeParse({
      ...draftInput,
      discount: 0.8,
    }).success).toBe(false);
  });

  test("requires optimistic lock for update and action schemas", () => {
    expect(PlatformServiceProductUpdateSchema.safeParse({
      amount_fen: 880000,
      expected_version: 2,
    }).success).toBe(true);
    expect(PlatformServiceProductUpdateSchema.safeParse({
      amount_fen: 880000,
    }).success).toBe(false);
    expect(PlatformServiceProductActionSchema.safeParse({
      expected_version: 2,
      idempotency_key: randomUUID(),
    }).success).toBe(true);
  });
});
