import { describe, expect, test } from "bun:test";

import {
  TenantDouyinLeadCaptureConfigResponseSchema,
  TenantDouyinLeadCaptureConfigUpdateSchema,
} from "./tenant-douyin-miniapp";

const valid = {
  authorizer_appid: "ttd033a68e4e56ccd301",
  enabled: true,
  clue_component_id: "5785490b6443ad9def6f88e69c57920c",
  expected_updated_at: "2026-09-06T00:00:00.000Z",
};

describe("tenant Douyin lead capture config schemas", () => {
  test("accepts exact enabled and disabled requests", () => {
    expect(TenantDouyinLeadCaptureConfigUpdateSchema.parse(valid)).toEqual(valid);
    expect(TenantDouyinLeadCaptureConfigUpdateSchema.parse({
      ...valid,
      enabled: false,
      clue_component_id: null,
    })).toEqual({ ...valid, enabled: false, clue_component_id: null });
  });

  test("requires a valid component ID when enabling and rejects extra fields", () => {
    for (const input of [
      { ...valid, clue_component_id: null },
      { ...valid, clue_component_id: "bad id" },
      { ...valid, tenant_id: "33333333-3333-4333-8333-333333333333" },
    ]) {
      expect(TenantDouyinLeadCaptureConfigUpdateSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("parses only the exact public response", () => {
    const response = {
      installation_id: "22222222-2222-4222-8222-222222222222",
      authorizer_appid: valid.authorizer_appid,
      enabled: true,
      clue_component_id: valid.clue_component_id,
      updated_at: "2026-09-06T00:00:01.000Z",
    };
    expect(TenantDouyinLeadCaptureConfigResponseSchema.parse(response))
      .toEqual(response);
    expect(TenantDouyinLeadCaptureConfigResponseSchema.safeParse({
      ...response,
      secret: "forbidden",
    }).success).toBe(false);
    expect(TenantDouyinLeadCaptureConfigResponseSchema.safeParse({
      ...response,
      clue_component_id: null,
    }).success).toBe(false);
  });
});
