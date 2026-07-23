import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rootSecret = "preflight-test-root-secret";
const now = "2026-07-21T10:00:00.000Z";

const sensitivePayload = {
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
};

type TestAttachment = {
  category: string;
  object_key: string;
  file_name: string;
  content_type: string;
  size: number;
  file_object_id?: string;
  ocr_recognition_id?: string;
  ocr_review_status?: string;
};

function attachment(
  category: string,
  overrides: Partial<TestAttachment> = {},
): TestAttachment {
  return {
    category,
    object_key:
      `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/${category}.jpg`,
    file_name: `${category}.jpg`,
    content_type: "image/jpeg",
    size: 1024,
    ocr_review_status: "manual",
    ...overrides,
  };
}

function applyment(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    application_no: "WPA202607210001",
    status: "approved",
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    merchant_short_name: "晴天装饰",
    license_name: "固始晴天装饰工程有限公司",
    license_code: "91411525MA00000000",
    license_address: "河南省信阳市固始县示例大道1号",
    license_period_begin: "2020-01-01",
    license_period_end: "长期",
    legal_representative_name: "张三",
    identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
    identity_address_masked: "河南省信阳市***1号",
    identity_period_begin: "2020-01-01",
    identity_period_end: "2040-01-01",
    contact_type: "LEGAL",
    super_admin_name: "李四",
    super_admin_phone_masked: "138****0000",
    super_admin_email: "admin@example.com",
    contact_identity_doc_type: null,
    contact_identity_period_begin: null,
    contact_identity_period_end: null,
    service_phone: "0376-1234567",
    settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    settlement_account_name: "固始晴天装饰工程有限公司",
    settlement_bank_name: "中国银行",
    settlement_bank_full_name: "中国银行股份有限公司固始支行",
    settlement_bank_branch_id: "104515080123",
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
    remark: null,
    applyment_business_code: null,
    applyment_id: null,
    applyment_state: "not_started",
    applyment_state_message: null,
    wechat_applyment_state_raw: null,
    sign_url: null,
    audit_detail: [],
    last_wechat_request_id: null,
    last_wechat_synced_at: null,
    sub_mchid: null,
    sub_appid: null,
    appid_binding_state: "not_bound",
    appid_binding_message: null,
    payment_config_id: null,
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    sensitive_payload_updated_at: "2026-07-21T09:00:00.000Z",
    submission_claimed_at: null,
    submission_attempt_count: 0,
    submitted_at: "2026-07-21T08:00:00.000Z",
    approved_at: "2026-07-21T09:00:00.000Z",
    opened_at: null,
    activated_at: null,
    rejected_at: null,
    rejected_reason: null,
    created_by_employee_id: null,
    updated_by_employee_id: null,
    reviewed_by_employee_id: null,
    created_at: "2026-07-21T08:00:00.000Z",
    updated_at: "2026-07-21T09:00:00.000Z",
    ...overrides,
  } as WechatPayApplymentRecord;
}

function sensitiveRecord(
  overrides: Partial<WechatPayApplymentSensitiveRecord> = {},
): WechatPayApplymentSensitiveRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      payload: sensitivePayload,
      rootSecret,
    }),
    ...overrides,
  };
}

async function loadSubject() {
  return import("./wechat-pay-applyment-preflight");
}

describe("wechat pay applyment preflight", () => {
  test("builds a preflight port that reuses an already loaded applyment", async () => {
    const findById = mock(async () => applyment());
    const findSensitivePayloadById = mock(async () => sensitiveRecord());
    const { createWechatPayApplymentPreflightService } = await loadSubject();
    const preflight = createWechatPayApplymentPreflightService({
      repository: { findById, findSensitivePayloadById },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(await preflight.runForApplyment?.(applyment())).toEqual({
      ready: true,
      blockers: [],
    });
    expect(findById).not.toHaveBeenCalled();
    expect(findSensitivePayloadById).toHaveBeenCalledTimes(1);
  });

  test("reports ready without external media or WeChat writes", async () => {
    const findById = mock(async () => applyment());
    const findSensitivePayloadById = mock(async () => sensitiveRecord());
    const loadRuntimeProfile = mock(async () => ({ ready: true }));
    const { runWechatPayApplymentPreflight } = await loadSubject();

    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: { findById, findSensitivePayloadById },
      loadRuntimeProfile,
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report).toEqual({ ready: true, blockers: [] });
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findSensitivePayloadById).toHaveBeenCalledTimes(1);
    expect(loadRuntimeProfile).toHaveBeenCalledTimes(1);
  });

  test("reports each missing field from a partial sensitive draft", async () => {
    const partialCiphertext = encryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      payload: { identity_name: "张三" },
      rootSecret,
    });
    const { runWechatPayApplymentPreflight } = await loadSubject();

    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => applyment(),
        findSensitivePayloadById: async () => sensitiveRecord({
          sensitive_payload_ciphertext: partialCiphertext,
        }),
      },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report).toEqual({
      ready: false,
      blockers: [
        "identity_number",
        "contact_name",
        "contact_phone",
        "contact_email",
        "bank_account_name",
        "bank_account_number",
      ].map((field) => ({
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: `sensitive.${field}`,
      })),
    });
  });

  test("blocks a settlement rule that does not match the subject and industry", async () => {
    const { runWechatPayApplymentPreflight } = await loadSubject();
    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => applyment({
          settlement_id: "719",
          qualification_type: "生活服务/家装服务",
        }),
        findSensitivePayloadById: async () => sensitiveRecord(),
      },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report).toEqual({
      ready: false,
      blockers: [{
        code: "APPLYMENT_SETTLEMENT_RULE_INVALID",
        field: "settlement_id",
      }],
    });
  });

  test("blocks enterprise personal accounts and unreviewed OCR attachments", async () => {
    const { runWechatPayApplymentPreflight } = await loadSubject();
    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => applyment({
          settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
          attachments: [
            attachment("license_copy", {
              ocr_review_status: "review_required",
            }),
            attachment("legal_representative_id_card_front"),
            attachment("legal_representative_id_card_back"),
          ],
        }),
        findSensitivePayloadById: async () => sensitiveRecord(),
      },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report).toEqual({
      ready: false,
      blockers: expect.arrayContaining([
        {
          code: "APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID",
          field: "settlement_account_type",
        },
        {
          code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
          category: "license_copy",
        },
      ]),
    });
  });

  test("returns only safe blocker codes and attachment categories", async () => {
    const unsafeObjectKey =
      "tenants/other-tenant/wechat-pay-applyment/private-license.jpg";
    const record = applyment({
      merchant_short_name: " ",
      attachments: [
        attachment("license_copy", { content_type: "application/pdf" }),
        attachment("legal_representative_id_card_front", {
          object_key: unsafeObjectKey,
        }),
        attachment("legal_representative_id_card_back", {
          size: 2 * 1024 * 1024 + 1,
        }),
      ],
    });
    const loadRuntimeProfile = mock(async () => {
      throw Errors.business(
        409,
        "包含不应输出的密钥详情",
        "PLATFORM_PAYMENT_PROFILE_NOT_READY",
        {
          blocker_codes: [
            "PLATFORM_PAYMENT_CONFIG_INACTIVE",
            "private_key_pem=do-not-leak",
          ],
        },
      );
    });
    const { runWechatPayApplymentPreflight } = await loadSubject();

    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => record,
        findSensitivePayloadById: async () => sensitiveRecord({
          sensitive_payload_ciphertext:
            "ciphertext-with-identity-41000019900101001X",
        }),
      },
      loadRuntimeProfile,
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining([
      { code: "APPLYMENT_REQUIRED_FIELD_MISSING", field: "merchant_short_name" },
      { code: "APPLYMENT_MEDIA_TYPE_UNSUPPORTED", category: "license_copy" },
      {
        code: "APPLYMENT_OBJECT_KEY_INVALID",
        category: "legal_representative_id_card_front",
      },
      {
        code: "APPLYMENT_MEDIA_TOO_LARGE",
        category: "legal_representative_id_card_back",
      },
      { code: "APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE" },
      { code: "PLATFORM_PAYMENT_CONFIG_INACTIVE" },
    ]));
    const serialized = JSON.stringify(report);
    for (const forbidden of [
      "张三",
      "李四",
      "13800000000",
      "41000019900101001X",
      "6212345678901234",
      unsafeObjectKey,
      "private_key_pem",
      "do-not-leak",
      "ciphertext-with-identity",
    ]) expect(serialized).not.toContain(forbidden);
  });

  test("blocks a fresh applying lease and allows an expired lease", async () => {
    const { runWechatPayApplymentPreflight } = await loadSubject();
    const dependencies = {
      repository: {
        findById: async () => applyment({
          status: "applying",
          submission_claimed_at: "2026-07-21T09:58:00.000Z",
        }),
        findSensitivePayloadById: async () => sensitiveRecord(),
      },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    };

    expect(await runWechatPayApplymentPreflight(applymentId, dependencies))
      .toEqual({
        ready: false,
        blockers: [{ code: "APPLYMENT_SUBMISSION_IN_PROGRESS" }],
      });

    dependencies.repository.findById = async () => applyment({
      status: "applying",
      submission_claimed_at: "2026-07-21T09:54:59.000Z",
    });
    expect(await runWechatPayApplymentPreflight(applymentId, dependencies))
      .toEqual({ ready: true, blockers: [] });
  });

  test("allows multiple business scene materials", async () => {
    const { runWechatPayApplymentPreflight } = await loadSubject();
    const record = applyment({
      attachments: [
        ...applyment().attachments as TestAttachment[],
        attachment("business_scene_material", {
          object_key:
            `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/scene-1.jpg`,
        }),
        attachment("business_scene_material", {
          object_key:
            `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/scene-2.jpg`,
        }),
      ],
    });

    expect(await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => record,
        findSensitivePayloadById: async () => sensitiveRecord(),
      },
      loadRuntimeProfile: async () => ({ ready: true }),
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    })).toEqual({ ready: true, blockers: [] });
  });

  test("maps untrusted runtime error codes to an internal blocker", async () => {
    const { runWechatPayApplymentPreflight } = await loadSubject();
    const report = await runWechatPayApplymentPreflight(applymentId, {
      repository: {
        findById: async () => applyment(),
        findSensitivePayloadById: async () => sensitiveRecord(),
      },
      loadRuntimeProfile: async () => {
        throw Errors.business(500, "private-key-material", "PRIVATE_KEY_PEM");
      },
      encryptionRootSecretFactory: () => rootSecret,
      nowFactory: () => now,
    });

    expect(report).toEqual({
      ready: false,
      blockers: [{ code: "PREFLIGHT_INTERNAL_ERROR" }],
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE_KEY_PEM");
  });

  test("distinguishes invalid arguments from unexpected execution errors", async () => {
    const { runWechatPayApplymentPreflightCommand } = await loadSubject();

    expect(await runWechatPayApplymentPreflightCommand([], async () => ({
      ready: true,
      blockers: [],
    }))).toEqual({
      ready: false,
      blockers: [{ code: "PREFLIGHT_ARGUMENT_INVALID" }],
    });
    expect(await runWechatPayApplymentPreflightCommand(
      [`--applyment-id=${applymentId}`],
      async () => {
        throw Errors.business(500, "private-key-material", "PRIVATE_KEY_PEM");
      },
    )).toEqual({
      ready: false,
      blockers: [{ code: "PREFLIGHT_INTERNAL_ERROR" }],
    });
  });

  test("parses only one UUID applyment argument", async () => {
    const { parseWechatPayApplymentPreflightArgs } = await loadSubject();

    expect(parseWechatPayApplymentPreflightArgs([
      "--applyment-id",
      applymentId,
    ])).toEqual({ applymentId });
    expect(parseWechatPayApplymentPreflightArgs([
      `--applyment-id=${applymentId}`,
    ])).toEqual({ applymentId });
    expect(() => parseWechatPayApplymentPreflightArgs([])).toThrow();
    expect(() => parseWechatPayApplymentPreflightArgs([
      "--applyment-id",
      "not-a-uuid",
    ])).toThrow();
    expect(() => parseWechatPayApplymentPreflightArgs([
      "--unknown",
    ])).toThrow();
    expect(() => parseWechatPayApplymentPreflightArgs([
      "--applyment-id",
      applymentId,
      `--applyment-id=${applymentId}`,
    ])).toThrow();
  });
});
