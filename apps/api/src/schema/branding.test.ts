import { describe, expect, test } from "bun:test";
import {
  BrandingDraftSchema,
  BrandingEmptyQuerySchema,
  BrandingEntitlementListQuerySchema,
  BrandingPublishSchema,
  BrandingTenantParamsSchema,
  EntitlementGrantSchema,
  EntitlementResumeSchema,
  EntitlementRevokeSchema,
  EntitlementSuspendSchema,
} from "./branding";
import type {
  BrandingDraftInput,
  BrandingEmptyQueryInput,
  BrandingEntitlementListQueryInput,
  BrandingPublishInput,
  BrandingTenantParamsInput,
  EntitlementGrantInput,
  EntitlementResumeInput,
  EntitlementRevokeInput,
  EntitlementSuspendInput,
} from "./branding";

const uuid = "00000000-0000-4000-8000-000000000010";

const inferredInputContracts = [
  {
    display_name: "晴天装饰",
    logo_file_id: uuid,
    version: 0,
  } satisfies BrandingDraftInput,
  { version: 1 } satisfies BrandingPublishInput,
  { id: uuid } satisfies BrandingTenantParamsInput,
  {} satisfies BrandingEmptyQueryInput,
  { page: 1, pageSize: 20 } satisfies BrandingEntitlementListQueryInput,
  {
    term_years: 1,
    reason: "平台赠送一年品牌权益",
  } satisfies EntitlementGrantInput,
  {
    version: 1,
    reason: "内容待核验",
  } satisfies EntitlementSuspendInput,
  {
    version: 2,
    reason: "内容已核验",
  } satisfies EntitlementResumeInput,
  {
    version: 3,
    reason: "租户主动终止服务",
    confirm: true,
  } satisfies EntitlementRevokeInput,
] as const;
void inferredInputContracts;

describe("branding profile schemas", () => {
  test("accepts the documented draft and publish payloads", () => {
    expect(BrandingDraftSchema.parse({
      display_name: "晴天装饰",
      logo_file_id: uuid,
      version: 0,
    })).toEqual({
      display_name: "晴天装饰",
      logo_file_id: uuid,
      version: 0,
    });
    expect(BrandingPublishSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });

  test("trims display names and counts Unicode code points", () => {
    expect(BrandingDraftSchema.parse({
      display_name: "  晴天装饰  ",
      logo_file_id: uuid,
      version: 0,
    }).display_name).toBe("晴天装饰");
    expect(BrandingDraftSchema.safeParse({
      display_name: `品牌${"😀".repeat(38)}`,
      logo_file_id: uuid,
      version: 0,
    }).success).toBe(true);
    expect(BrandingDraftSchema.safeParse({
      display_name: `品牌${"😀".repeat(39)}`,
      logo_file_id: uuid,
      version: 0,
    }).success).toBe(false);
  });

  test("accepts private-use Unicode code points", () => {
    expect(BrandingDraftSchema.safeParse({
      display_name: "品牌\uE000",
      logo_file_id: uuid,
      version: 0,
    }).success).toBe(true);
  });

  test("rejects empty, control, and punctuation-or-symbol-only display names", () => {
    for (const display_name of [
      "",
      " \t\n ",
      "\u0000\u0001",
      "！？—",
      "★😀",
      "字",
    ]) {
      expect(BrandingDraftSchema.safeParse({
        display_name,
        logo_file_id: uuid,
        version: 0,
      }).success).toBe(false);
    }
  });

  test("rejects invalid UUIDs, versions, and unknown draft keys", () => {
    for (const input of [
      { display_name: "晴天装饰", logo_file_id: "not-uuid", version: 0 },
      { display_name: "晴天装饰", logo_file_id: uuid, version: -1 },
      { display_name: "晴天装饰", logo_file_id: uuid, version: 1.5 },
      {
        display_name: "晴天装饰",
        logo_file_id: uuid,
        logo_url: "https://example.com/logo.png",
        version: 0,
      },
      {
        display_name: "晴天装饰",
        logo_file_id: uuid,
        tenant_id: uuid,
        version: 0,
      },
    ]) {
      expect(BrandingDraftSchema.safeParse(input).success).toBe(false);
    }

    expect(BrandingPublishSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(BrandingPublishSchema.safeParse({
      version: 1,
      tenant_id: uuid,
    }).success).toBe(false);
  });
});

describe("branding query and params schemas", () => {
  test("accepts only an empty effective-brand query", () => {
    expect(BrandingEmptyQuerySchema.parse({})).toEqual({});

    for (const query of [{ tenant_id: uuid }, { arbitrary: "value" }]) {
      expect(BrandingEmptyQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  test("accepts only a strict tenant UUID param", () => {
    expect(BrandingTenantParamsSchema.parse({ id: uuid })).toEqual({ id: uuid });
    expect(BrandingTenantParamsSchema.safeParse({ id: "tenant-1" }).success)
      .toBe(false);
    expect(BrandingTenantParamsSchema.safeParse({
      id: uuid,
      tenant_id: uuid,
    }).success).toBe(false);
  });

  test("uses bounded pagination defaults and rejects unknown keys", () => {
    expect(BrandingEntitlementListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(BrandingEntitlementListQuerySchema.parse({
      page: "2",
      pageSize: "100",
    })).toEqual({ page: 2, pageSize: 100 });

    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { tenant_id: uuid },
    ]) {
      expect(BrandingEntitlementListQuerySchema.safeParse(query).success)
        .toBe(false);
    }
  });
});

describe("branding entitlement action schemas", () => {
  test("accepts documented payloads and defaults grant term to one year", () => {
    expect(EntitlementGrantSchema.parse({
      reason: "  平台赠送一年品牌权益  ",
    })).toEqual({
      term_years: 1,
      reason: "平台赠送一年品牌权益",
    });
    expect(EntitlementGrantSchema.parse({
      term_years: 1,
      reason: "平台赠送一年品牌权益",
    })).toEqual({
      term_years: 1,
      reason: "平台赠送一年品牌权益",
    });
    expect(EntitlementSuspendSchema.parse({
      version: 1,
      reason: "内容待核验",
    })).toEqual({ version: 1, reason: "内容待核验" });
    expect(EntitlementResumeSchema.parse({
      version: 2,
      reason: "内容已核验",
    })).toEqual({ version: 2, reason: "内容已核验" });
    expect(EntitlementRevokeSchema.parse({
      version: 3,
      reason: "租户主动终止服务",
      confirm: true,
    })).toEqual({
      version: 3,
      reason: "租户主动终止服务",
      confirm: true,
    });
  });

  test("rejects invalid grant terms and reasons outside the trimmed bounds", () => {
    for (const term_years of [0, 11, 1.5]) {
      expect(EntitlementGrantSchema.safeParse({
        term_years,
        reason: "平台赠送一年品牌权益",
      }).success).toBe(false);
    }

    for (const reason of ["", " ", "一", "理".repeat(501)]) {
      expect(EntitlementGrantSchema.safeParse({
        reason,
      }).success).toBe(false);
    }
  });

  test("requires positive action versions, bounded reasons, and literal revoke confirmation", () => {
    for (const schema of [
      EntitlementSuspendSchema,
      EntitlementResumeSchema,
      EntitlementRevokeSchema,
    ]) {
      expect(schema.safeParse({
        version: 0,
        reason: "内容待核验",
        confirm: true,
      }).success).toBe(false);
      expect(schema.safeParse({
        version: 1,
        reason: "理".repeat(501),
        confirm: true,
      }).success).toBe(false);
      expect(schema.safeParse({
        version: 1,
        reason: "内容待核验",
        confirm: true,
        tenant_id: uuid,
      }).success).toBe(false);
    }

    expect(EntitlementRevokeSchema.safeParse({
      version: 3,
      reason: "租户主动终止服务",
    }).success).toBe(false);
    expect(EntitlementRevokeSchema.safeParse({
      version: 3,
      reason: "租户主动终止服务",
      confirm: false,
    }).success).toBe(false);
  });
});
