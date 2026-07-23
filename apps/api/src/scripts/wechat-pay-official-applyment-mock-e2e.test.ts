import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";
import type {
  SubmitWechatPayApplymentGatewayInput,
  WechatPayApplymentQueryResult,
  WechatPayApplymentState,
} from "@/services/wechat-pay-applyment-gateway";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
import type {
  WechatPayApplymentRepositoryPort,
  WechatPayConfigRepositoryPort,
} from "@/services/wechat-pay-applyments-types";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const platformConfigId = "44444444-4444-4444-8444-444444444444";
const paymentConfigId = "55555555-5555-4555-8555-555555555555";
const businessCode = "1561816121_WPA202607210001";
const wechatApplymentId = "2000002124775691";
const subMchid = "1900000109";
const rootSecret = "mock-e2e-root-secret";
const baseTime = Date.parse("2026-07-21T10:00:00.000Z");

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

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

const attachmentCategories = ["license_copy",
  "legal_representative_id_card_front", "legal_representative_id_card_back",
  "business_scene_material"] as const;

function createApplyment(): WechatPayApplymentRecord {
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
    attachments: attachmentCategories.map((category) => ({
      category,
      object_key:
        `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/${category}.jpg`,
      file_name: `${category}.jpg`,
      ocr_review_status: "manual",
      content_type: "image/jpeg",
      size: 1024,
    })),
    remark: null,
    applyment_business_code: null,
    applyment_id: null,
    applyment_state: "submitted",
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
    created_by_employee_id: employeeId,
    updated_by_employee_id: employeeId,
    reviewed_by_employee_id: employeeId,
    created_at: "2026-07-21T08:00:00.000Z",
    updated_at: "2026-07-21T09:00:00.000Z",
  } as WechatPayApplymentRecord;
}

function platformProfile(): PlatformPaymentConfigRecord {
  return {
    id: platformConfigId,
    provider: "wechat_pay",
    profile_code: "tenant_service_provider",
    principal_type: "platform",
    merchant_mode: "service_provider_sub_merchant",
    merchant_name: "平台服务商",
    merchant_id: "1561816121",
    sub_merchant_id: null,
    app_id: "wx-platform-app",
    sub_app_id: null,
    encrypted_config_ref: "setting://WECHAT_PAY_SERVICE_PROVIDER",
    secret_bundle_revision: "revision-1",
    serial_no: "SERVICE-PROVIDER-SERIAL",
    notify_url: "https://api.goodcms.cn/pay/wechat/callback",
    enabled_channels: ["project_payment", "applyment"],
    status: "active",
    validation_status: "valid",
    last_validated_at: "2026-07-21T09:00:00.000Z",
    risk_switches: {},
    created_by_employee_id: employeeId,
    updated_by_employee_id: employeeId,
    created_at: "2026-07-21T08:00:00.000Z",
    updated_at: "2026-07-21T09:00:00.000Z",
  } as PlatformPaymentConfigRecord;
}

function platformAuth(): AuthContext {
  return {
    authUserId: "auth-platform",
    employeeId,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [
      { code: "platform.wechat_pay.applyment.submit", scope: "all" },
      { code: "platform.wechat_pay.applyment.sync", scope: "all" },
      { code: "platform.wechat_pay.applyment.manage", scope: "all" },
      { code: "platform.wechat_pay.config.activate", scope: "all" },
    ],
  };
}

function queryResult(
  state: WechatPayApplymentState,
): WechatPayApplymentQueryResult {
  const canSign = [
    "APPLYMENT_STATE_TO_BE_CONFIRMED",
    "APPLYMENT_STATE_TO_BE_SIGNED",
  ].includes(state);
  return {
    businessCode,
    applymentId: wechatApplymentId,
    subMchid: state === "APPLYMENT_STATE_FINISHED" ? subMchid : null,
    signUrl: canSign ? "https://pay.weixin.qq.com/sign/mock" : null,
    applymentState: state,
    applymentStateMessage: state,
    auditDetail: [],
    requestId: `request-${state}`,
  };
}

describe("official WeChat Pay applyment mock E2E", () => {
  test("keeps identifiers and media stable through submit, sync, and activate", async () => {
    let current = createApplyment();
    let tick = 0;
    const nextTime = () => new Date(baseTime + tick++ * 1000).toISOString();
    let sensitive: WechatPayApplymentSensitiveRecord = {
      id: applymentId,
      tenant_id: tenantId,
      has_sensitive_payload: true,
      sensitive_payload_version: 1,
      sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
        context: { tenantId, applymentId, version: 1 },
        payload: sensitivePayload,
        rootSecret,
      }),
    };
    const originalCiphertext = sensitive.sensitive_payload_ciphertext;
    const events: WechatPayApplymentEventRecord[] = [];
    let activeConfig: WechatPayConfigRecord | null = null;

    const insertEvent = async (input: WechatPayApplymentEventInsert) => {
      const event = {
        id: `event-${events.length + 1}`,
        created_at: nextTime(),
        ...input,
        from_status: input.from_status ?? null,
        to_status: input.to_status ?? null,
        message: input.message ?? null,
        operator_employee_id: input.operator_employee_id ?? null,
        metadata: input.metadata ?? {},
      } as WechatPayApplymentEventRecord;
      events.push(event);
      return event;
    };
    const repository: WechatPayApplymentRepositoryPort = {
      findLatestByTenant: async () => current,
      findById: async () => current,
      findSensitivePayloadById: async () => sensitive,
      createApplyment: async () => current,
      updateApplyment: async (input) => {
        if (input.expectedStatus && input.expectedStatus !== current.status) {
          throw Errors.business(409, "mock CAS status mismatch", "MOCK_CAS_FAILED");
        }
        if (
          input.expectedUpdatedAt && input.expectedUpdatedAt !== current.updated_at
        ) throw Errors.business(409, "mock CAS revision mismatch", "MOCK_CAS_FAILED");
        current = {
          ...current,
          ...input.patch,
          updated_at: nextTime(),
        } as WechatPayApplymentRecord;
        return current;
      },
      submitTenantApplymentAtomically: async () => current,
      activateConfigAtomically: async (input) => {
        if (input.expectedUpdatedAt !== current.updated_at) {
          throw Errors.business(409, "mock CAS revision mismatch", "MOCK_CAS_FAILED");
        }
        const activatedAt = nextTime();
        activeConfig = {
          id: paymentConfigId,
          tenant_id: tenantId,
          provider: "wechat_pay",
          principal_type: "tenant",
          merchant_mode: "service_provider_sub_merchant",
          merchant_name: current.merchant_short_name,
          merchant_id: platformProfile().merchant_id,
          sub_merchant_id: subMchid,
          app_id: platformProfile().app_id,
          sub_app_id: null,
          encrypted_config_ref: platformProfile().encrypted_config_ref,
          serial_no: platformProfile().serial_no,
          notify_url: platformProfile().notify_url,
          enabled_channels: ["project_payment"],
          status: "active",
          validation_status: "valid",
          appid_binding_state: "bound",
          appid_binding_message: "使用平台统一小程序 AppID",
          applyment_business_code: businessCode,
          applyment_id: wechatApplymentId,
          applyment_state: "opened",
          applyment_state_message: current.applyment_state_message,
          settlement_account_summary: current.settlement_account_summary,
          platform_payment_config_id: input.platformPaymentConfigId,
          risk_switches: {},
          opened_at: current.opened_at,
          enabled_at: activatedAt,
          disabled_at: null,
          suspended_at: null,
          created_by_employee_id: employeeId,
          updated_by_employee_id: employeeId,
          created_at: activatedAt,
          updated_at: activatedAt,
          last_validated_at: activatedAt,
        };
        const fromStatus = current.status;
        current = {
          ...current,
          status: "active",
          payment_config_id: paymentConfigId,
          activated_at: activatedAt,
          has_sensitive_payload: false,
          sensitive_payload_version: null,
          sensitive_payload_updated_at: null,
          updated_at: activatedAt,
        };
        sensitive = {
          ...sensitive,
          has_sensitive_payload: false,
          sensitive_payload_version: null,
          sensitive_payload_ciphertext: null,
        };
        await insertEvent({
          tenant_id: tenantId,
          applyment_id: applymentId,
          event_type: "config_activated",
          from_status: fromStatus,
          to_status: "active",
          message: "平台激活租户微信支付配置",
          operator_employee_id: employeeId,
          metadata: { payment_config_id: paymentConfigId },
        });
        return current;
      },
      insertEvent,
      findEvents: async () => [...events],
      listApplyments: async () => ({
        list: [current],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
    };
    const configRepository: WechatPayConfigRepositoryPort = {
      upsertWechatPayConfig: async () => activeConfig as WechatPayConfigRecord,
      updateWechatPayConfig: async () => activeConfig as WechatPayConfigRecord,
    };
    const profileRepository = {
      findWechatPayConfigByProfile: async () => platformProfile(),
    };
    const accessPolicy = {
      hasPermission: (auth: AuthContext, permission: string) =>
        auth.permissions.some((item) => item.code === permission),
    };
    const mediaIds = new Map<string, string>();
    const resolveMedia = mock(async (input: {
      attachment: { category: string; object_key: string };
    }) => {
      const cached = mediaIds.get(input.attachment.object_key);
      if (cached) return { mediaId: cached };
      const mediaId = `MEDIA_${input.attachment.category}`;
      mediaIds.set(input.attachment.object_key, mediaId);
      return { mediaId };
    });
    const submitRequests: SubmitWechatPayApplymentGatewayInput[] = [];
    const submit = mock(async (input: SubmitWechatPayApplymentGatewayInput) => {
      submitRequests.push(input);
      if (submitRequests.length === 1) {
        throw Errors.business(
          504,
          "mock timeout",
          "WECHAT_PAY_APPLYMENT_TIMEOUT",
        );
      }
      return { applymentId: wechatApplymentId, requestId: "submit-request" };
    });
    const states: WechatPayApplymentState[] = ["APPLYMENT_STATE_AUDITING",
      "APPLYMENT_STATE_TO_BE_CONFIRMED", "APPLYMENT_STATE_TO_BE_SIGNED",
      "APPLYMENT_STATE_SIGNING", "APPLYMENT_STATE_FINISHED"];
    let recoveryLookup = true;
    const queryByBusinessCode = mock(async () => {
      if (recoveryLookup) {
        recoveryLookup = false;
        throw Errors.business(
          400,
          "mock not found",
          "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
          { operation: "query", status: 400, wechatCode: "APPLYMENT_NOT_EXIST" },
        );
      }
      const state = states.shift();
      if (!state) {
        throw Errors.business(500, "mock state exhausted", "MOCK_STATE_EXHAUSTED");
      }
      return queryResult(state);
    });
    const secretBundle = {
      load: async () => ({
        privateKeyPem: keys.privateKey,
        apiV3Key: "12345678901234567890123456789012",
        wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
        wechatPayPublicKeyPem: keys.publicKey,
        baseUrl: "https://api.mch.weixin.qq.com",
        revision: "revision-1",
      }),
    };
    const { WechatPayApplymentSubmissionService } = await import(
      "@/services/wechat-pay-applyment-submission"
    );
    const { WechatPayApplymentStatusService } = await import(
      "@/services/wechat-pay-applyment-status"
    );
    const { WechatPayApplymentPlatformActions } = await import(
      "@/services/wechat-pay-applyments-platform"
    );
    const submissionService = new WechatPayApplymentSubmissionService({
      repository: {
        claimSubmission: async () => {
          current = {
            ...current,
            status: "applying",
            submission_claimed_at: nextTime(),
            submission_attempt_count: current.submission_attempt_count + 1,
            updated_at: nextTime(),
          };
          return current;
        },
        findSensitivePayloadById: repository.findSensitivePayloadById,
        updateApplyment: repository.updateApplyment,
        insertEvent,
        findEvents: repository.findEvents,
      },
      platformPaymentConfigRepository: profileRepository,
      accessPolicyService: accessPolicy,
      secretBundleService: secretBundle,
      mediaService: { resolveMedia },
      gateway: { submit, queryByBusinessCode },
      encryptionRootSecretFactory: () => rootSecret,
      businessCodeFactory: () => businessCode,
      nowFactory: nextTime,
    });
    const statusService = new WechatPayApplymentStatusService({
      repository,
      platformPaymentConfigRepository: profileRepository,
      accessPolicyService: accessPolicy,
      secretBundleService: secretBundle,
      gateway: { queryByBusinessCode },
      nowFactory: nextTime,
    });
    const actions = new WechatPayApplymentPlatformActions(
      repository,
      configRepository,
      profileRepository,
      nextTime,
      submissionService,
      statusService,
      accessPolicy,
      { run: async () => ({ ready: true, blockers: [] }) },
    );
    const auth = platformAuth();
    const projections = [await actions.submitToWechat(auth, applymentId)];
    for (let index = 0; index < 4; index += 1) {
      projections.push(await actions.syncWechatStatus(auth, applymentId));
    }
    projections.push(await actions.activateConfig(auth, applymentId));

    expect(submitRequests).toHaveLength(2);
    expect(submitRequests[0]?.request).toEqual(submitRequests[1]?.request);
    expect(resolveMedia).toHaveBeenCalledTimes(attachmentCategories.length);
    expect(mediaIds.size).toBe(attachmentCategories.length);
    expect(current.applyment_business_code).toBe(businessCode);
    expect(current.applyment_id).toBe(wechatApplymentId);
    expect(events.map((event) => [event.from_status, event.to_status])).toEqual([
      ["applying", "reviewing"],
      ["reviewing", "account_verifying"],
      ["account_verifying", "signing"],
      ["signing", "opening"],
      ["opening", "opened"],
      ["opened", "active"],
    ]);
    expect(current).toMatchObject({ status: "active",
      payment_config_id: paymentConfigId, has_sensitive_payload: false,
      sensitive_payload_version: null });
    expect(sensitive).toMatchObject({ has_sensitive_payload: false,
      sensitive_payload_ciphertext: null, sensitive_payload_version: null });
    expect(activeConfig).toMatchObject({ status: "active", tenant_id: tenantId,
      sub_merchant_id: subMchid,
      platform_payment_config_id: platformConfigId });
    const projected = JSON.stringify(projections);
    for (const forbidden of [sensitivePayload.identity_number,
      sensitivePayload.bank_account_number, originalCiphertext, keys.privateKey,
      "sensitive_payload_ciphertext"]) expect(projected).not.toContain(forbidden);
  });
});
