import { describe, expect, test } from "bun:test";
import {
  PlatformAdminIdempotencyHeadersSchema,
  PlatformAdminPartnerApproveSchema,
  PlatformAdminPartnerRequestSupplementSchema,
  PlatformAdminReviewListQuerySchema,
  PlatformAdminReviewLogListQuerySchema,
  PlatformAdminTenantApproveSchema,
  PlatformAdminTenantRejectSchema,
} from "@/schema/platform-admin-review-workbench";

describe("platform admin review workbench schemas", () => {
  test("defaults bounded mobile pagination", () => {
    expect(PlatformAdminReviewListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(() => PlatformAdminReviewListQuerySchema.parse({ pageSize: 51 }))
      .toThrow("每页条数不能超过 50");
  });

  test("accepts only supported review log targets", () => {
    expect(PlatformAdminReviewLogListQuerySchema.parse({
      target_type: "tenant_onboarding_application",
      target_id: "00000000-0000-4000-8000-000000000001",
    })).toMatchObject({ page: 1, pageSize: 20 });
    expect(() => PlatformAdminReviewLogListQuerySchema.parse({
      target_type: "tenant",
      target_id: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
  });

  test("requires a UUID idempotency key", () => {
    expect(PlatformAdminIdempotencyHeadersSchema.parse({
      "idempotency-key": "00000000-0000-4000-8000-000000000002",
    })).toEqual({
      "idempotency-key": "00000000-0000-4000-8000-000000000002",
    });
    expect(() => PlatformAdminIdempotencyHeadersSchema.parse({})).toThrow();
  });

  test("keeps tenant publication outside onboarding approval", () => {
    expect(PlatformAdminTenantApproveSchema.parse({
      expected_version: 3,
      remark: "资料完整，同意入驻",
      publish_local_service_provider: false,
      assign_partner_id: null,
    })).toMatchObject({ expected_version: 3 });
    expect(() => PlatformAdminTenantApproveSchema.parse({
      expected_version: 3,
      remark: "资料完整，同意入驻",
      publish_local_service_provider: true,
      assign_partner_id: null,
    })).toThrow("本地服务商公开需走独立发布流程");
  });

  test("requires non-empty review remarks", () => {
    expect(() => PlatformAdminTenantRejectSchema.parse({
      expected_version: 1,
      remark: " ",
    })).toThrow();
    expect(() => PlatformAdminPartnerRequestSupplementSchema.parse({
      expected_version: 1,
      remark: " ",
      required_fields: [],
    })).toThrow();
  });

  test("validates partner approval level and regions", () => {
    expect(PlatformAdminPartnerApproveSchema.parse({
      expected_version: 2,
      remark: "符合合作条件",
      partner_level_code: "city",
      region_codes: ["411525"],
      generate_default_invite_code: true,
    })).toMatchObject({ partner_level_code: "city" });
    expect(() => PlatformAdminPartnerApproveSchema.parse({
      expected_version: 2,
      remark: "符合合作条件",
      partner_level_code: "",
      region_codes: [],
      generate_default_invite_code: true,
    })).toThrow();
  });
});
