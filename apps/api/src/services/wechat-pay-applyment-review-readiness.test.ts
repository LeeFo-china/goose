import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import type {
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
import { createWechatPayApplymentTenantReviewReadinessService } from "@/services/wechat-pay-applyment-review-readiness";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rootSecret = "tenant-review-readiness-root-secret";

function attachment(category: string) {
  return {
    category,
    object_key:
      `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/${category}.jpg`,
    file_name: `${category}.jpg`,
    content_type: "image/jpeg",
    size: 1024,
    ocr_review_status: "manual",
  };
}

function completeDraft(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    status: "draft",
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    merchant_short_name: "晴天装饰",
    license_name: "固始晴天装饰工程有限公司",
    license_code: "91411525MA00000000",
    legal_representative_name: "张三",
    identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
    identity_address_masked: "河南省信阳市***1号",
    identity_period_begin: "2020-01-01",
    identity_period_end: "2040-01-01",
    contact_type: "LEGAL",
    super_admin_name: "李四",
    super_admin_phone_masked: "138****0000",
    super_admin_email: "admin@example.com",
    service_phone: "0376-1234567",
    settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    settlement_account_name: "固始晴天装饰工程有限公司",
    settlement_bank_name: "中国银行",
    settlement_account_number_masked: "62**********1234",
    settlement_account_summary: "中国银行 尾号 1234",
    settlement_id: "716",
    qualification_type: "零售批发/生活娱乐/网上商城/其他",
    business_scene_description: "装修项目收款",
    contact_address: "河南省信阳市固始县",
    attachments: [
      attachment("license_copy"),
      attachment("legal_representative_id_card_front"),
      attachment("legal_representative_id_card_back"),
    ],
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    submission_claimed_at: "2026-07-25T08:00:00.000Z",
    ...overrides,
  } as WechatPayApplymentRecord;
}

function sensitiveRecord(): WechatPayApplymentSensitiveRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      payload: {
        identity_name: "张三",
        identity_number: "41000019900101001X",
        identity_address: "河南省信阳市固始县示例路1号",
        contact_name: "李四",
        contact_phone: "13800000000",
        contact_email: "admin@example.com",
        contact_identity_number: null,
        contact_identity_address: null,
        bank_account_name: "固始晴天装饰工程有限公司",
        bank_account_number: "6212345678901234",
      },
      rootSecret,
    }),
  };
}

function createHarness() {
  const findSensitivePayloadById = mock(async () => sensitiveRecord());
  const findByIdsForTenant = mock(async () => []);
  return {
    service: createWechatPayApplymentTenantReviewReadinessService({
      repository: { findSensitivePayloadById },
      ocrRecognitionRepository: { findByIdsForTenant },
      encryptionRootSecretFactory: () => rootSecret,
    }),
    findSensitivePayloadById,
    findByIdsForTenant,
  };
}

describe("tenant WeChat Pay applyment review readiness", () => {
  test("returns no formal lifecycle or platform blockers for a complete draft", async () => {
    const harness = createHarness();
    const report = await harness.service.runForApplyment(completeDraft());

    expect(report).toEqual({
      ready: true,
      review_ready: true,
      blockers: [],
    });
    expect(harness.findSensitivePayloadById).toHaveBeenCalledTimes(1);
    expect(harness.findByIdsForTenant).not.toHaveBeenCalled();
  });

  test("returns only tenant-actionable blockers for an incomplete draft", async () => {
    const report = await createHarness().service.runForApplyment(
      completeDraft({ service_phone: null }),
    );

    expect(report).toEqual({
      ready: false,
      review_ready: false,
      blockers: [{
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: "service_phone",
      }],
    });
  });

  test("has no platform payment or secret loader dependency", () => {
    const source = readFileSync(
      new URL("./wechat-pay-applyment-review-readiness.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("platformPaymentConfigRepository");
    expect(source).not.toContain("wechatPaySecretBundleService");
    expect(source).not.toContain("loadApplymentRuntimeProfile");
    expect(source).not.toContain("submission_claimed_at");
  });
});
