import { beforeEach, describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPayApplymentEventRecord, WechatPayApplymentRecord, WechatPayApplymentUpdate } from "@/repositories/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";
import type {
  SubmitWechatPayApplymentGatewayInput,
  WechatPayApplymentQueryResult,
} from "./wechat-pay-applyment-gateway";
import { encryptApplymentSensitivePayload } from "./wechat-pay-applyment-sensitive-payload";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const platformConfigId = "44444444-4444-4444-8444-444444444444";
const rootSecret = "applyment-submission-test-root-secret";
const now = "2026-07-21T10:00:00.000Z";
const businessCode = "1561816121_WPA202607210001";
const wechatApplymentId = "2000002124775691";
const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const attachments = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "business_scene_material",
].map((category) => ({
  category,
  object_key: `tenants/${tenantId}/wechat-pay-applyment/${applymentId}/${category}.jpg`,
  file_name: `${category}.jpg`,
  ocr_review_status: category === "business_scene_material"
    ? undefined
    : "manual",
}));
function applyment(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    application_no: "WPA202607210001",
    status: "applying",
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
    attachments,
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
    submission_claimed_at: now,
    submission_attempt_count: 1,
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
    updated_at: now,
    tenant: { id: tenantId, name: "固始晴天装饰", slug: "qingtian" },
    ...overrides,
  };
}
const sensitive = {
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
const ciphertext = encryptApplymentSensitivePayload({
  context: { tenantId, applymentId, version: 1 },
  payload: sensitive,
  rootSecret,
});
const profile: PlatformPaymentConfigRecord = {
  id: platformConfigId,
  provider: "wechat_pay",
  profile_code: "tenant_service_provider",
  principal_type: "platform",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "好店大数据服务商",
  merchant_id: "1561816121",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  encrypted_config_ref: "setting://WECHAT_PAY_SERVICE_PROVIDER",
  secret_bundle_revision: "revision-1",
  serial_no: "SERVICE_PROVIDER_CERT_SERIAL",
  notify_url: "https://api.goodcms.cn/pay/wechat/callback",
  enabled_channels: ["project_payment", "applyment"],
  status: "active",
  validation_status: "valid",
  last_validated_at: now,
  risk_switches: {},
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  created_at: now,
  updated_at: now,
};
const claimSubmission = mock(async () => applyment());
const findSensitivePayloadById = mock(async () => ({
  id: applymentId,
  tenant_id: tenantId,
  has_sensitive_payload: true,
  sensitive_payload_ciphertext: ciphertext,
  sensitive_payload_version: 1,
}));
const updateApplyment = mock(async (input: {
  id: string;
  patch: WechatPayApplymentUpdate;
}) => applyment(input.patch as Partial<WechatPayApplymentRecord>));
const insertEvent = mock(async (input: Record<string, unknown>) => ({
  id: "55555555-5555-4555-8555-555555555555",
  tenant_id: tenantId,
  applyment_id: applymentId,
  event_type: String(input.event_type),
  from_status: input.from_status as string | null,
  to_status: input.to_status as string | null,
  message: input.message as string | null,
  operator_employee_id: employeeId,
  metadata: input.metadata ?? {},
  created_at: now,
} as WechatPayApplymentEventRecord));
const findEvents = mock(async () => [] as WechatPayApplymentEventRecord[]);
const findProfile = mock(async () => profile);
const loadSecretBundle = mock(async () => ({
  privateKeyPem: keys.privateKey,
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: keys.publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-1",
}));
const resolveMedia = mock(async (input: { attachment: { category: string } }) => ({
  mediaId: `MEDIA_${input.attachment.category}`,
}));
const submit = mock(async (_input: SubmitWechatPayApplymentGatewayInput) => ({
  applymentId: wechatApplymentId,
  requestId: "submit-request-id",
}));
const queryByBusinessCode = mock(
  async (): Promise<WechatPayApplymentQueryResult> => ({
  businessCode,
  applymentId: wechatApplymentId,
  subMchid: null,
  signUrl: null,
  applymentState: "APPLYMENT_STATE_AUDITING" as const,
  applymentStateMessage: "审核中",
  auditDetail: [],
  requestId: null,
  }),
);
function platformAuth(withPermission = true): AuthContext {
  return {
    authUserId: "auth-1",
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
    permissions: withPermission
      ? [{ code: "platform.wechat_pay.applyment.submit", scope: "all" }]
      : [],
  };
}
async function createService() {
  const { WechatPayApplymentSubmissionService } = await import(
    "./wechat-pay-applyment-submission"
  );
  return new WechatPayApplymentSubmissionService({
    repository: {
      claimSubmission,
      findSensitivePayloadById,
      updateApplyment,
      insertEvent,
      findEvents,
    },
    platformPaymentConfigRepository: {
      findWechatPayConfigByProfile: findProfile,
    },
    accessPolicyService: {
      hasPermission: (authContext, permission) =>
        authContext.permissions.some((item) => item.code === permission),
    },
    secretBundleService: { load: loadSecretBundle },
    mediaService: { resolveMedia },
    gateway: { submit, queryByBusinessCode },
    encryptionRootSecretFactory: () => rootSecret,
    businessCodeFactory: () => businessCode,
    nowFactory: () => now,
  });
}
describe("WechatPayApplymentSubmissionService", () => {
  beforeEach(() => {
    for (const fn of [
      claimSubmission,
      findSensitivePayloadById,
      updateApplyment,
      insertEvent,
      findEvents,
      findProfile,
      loadSecretBundle,
      resolveMedia,
      submit,
      queryByBusinessCode,
    ]) fn.mockClear();
    claimSubmission.mockImplementation(async () => applyment());
    findProfile.mockImplementation(async () => profile);
    submit.mockImplementation(async () => ({
      applymentId: wechatApplymentId,
      requestId: "submit-request-id",
    }));
    queryByBusinessCode.mockImplementation(async () => ({
      businessCode,
      applymentId: wechatApplymentId,
      subMchid: null,
      signUrl: null,
      applymentState: "APPLYMENT_STATE_AUDITING",
      applymentStateMessage: "审核中",
      auditDetail: [],
      requestId: null,
    }));
  });
  test("requires the dedicated platform submission permission", async () => {
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(false), applymentId))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(claimSubmission).not.toHaveBeenCalled();
  });
  test("propagates claim contention without touching WeChat", async () => {
    claimSubmission.mockRejectedValueOnce(Errors.business(
      409,
      "微信支付进件正在提交",
      "WECHAT_PAY_APPLYMENT_SUBMISSION_IN_PROGRESS",
    ));
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(), applymentId))
      .rejects.toMatchObject({
        code: "WECHAT_PAY_APPLYMENT_SUBMISSION_IN_PROGRESS",
      });
    expect(submit).not.toHaveBeenCalled();
  });
  test("rejects an unready central profile before media or submit", async () => {
    findProfile.mockImplementationOnce(async () => ({
      ...profile,
      validation_status: "invalid",
    }));
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(), applymentId))
      .rejects.toMatchObject({ code: "PLATFORM_PAYMENT_PROFILE_NOT_READY" });
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(updateApplyment).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({ submission_claimed_at: null }),
    }));
  });
  test("rejects a partial sensitive draft before media or WeChat submit", async () => {
    findSensitivePayloadById.mockImplementationOnce(async () => ({
      id: applymentId,
      tenant_id: tenantId,
      has_sensitive_payload: true,
      sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
        context: { tenantId, applymentId, version: 1 },
        payload: { identity_name: "张三" },
        rootSecret,
      }),
      sensitive_payload_version: 1,
    }));
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(), applymentId))
      .rejects.toMatchObject({
        statusCode: 400,
        code: "WECHAT_PAY_APPLYMENT_SENSITIVE_FIELDS_MISSING",
        details: {
          missing: expect.arrayContaining([
            "identity_number",
            "contact_phone",
            "bank_account_number",
          ]),
        },
      });
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  test("uploads all media, submits a complete encrypted request, and persists auditing", async () => {
    const service = await createService();
    const result = await service.submitToWechat(platformAuth(), applymentId);
    expect(resolveMedia).toHaveBeenCalledTimes(4);
    expect(submit).toHaveBeenCalledTimes(1);
    const submittedRequest = submit.mock.calls[0]?.[0]?.request;
    expect(submittedRequest).toMatchObject({
      business_code: businessCode,
      business_info: {
        sales_info: {
          mini_program_info: {
            mini_program_appid: "wxbac3b1e168fd968a",
            mini_program_pics: ["MEDIA_business_scene_material"],
          },
        },
      },
      subject_info: {
        business_license_info: { license_copy: "MEDIA_license_copy" },
      },
    });
    expect(JSON.stringify(submittedRequest)).not.toContain(sensitive.identity_number);
    expect(JSON.stringify(submittedRequest)).not.toContain(sensitive.bank_account_number);
    expect(queryByBusinessCode).toHaveBeenCalledWith(expect.objectContaining({
      businessCode,
    }));
    expect(result.applyment).toMatchObject({
      status: "reviewing",
      applyment_id: wechatApplymentId,
      wechat_applyment_state_raw: "APPLYMENT_STATE_AUDITING",
      submission_claimed_at: null,
    });
    expect(result.applyment).not.toHaveProperty("sensitive_payload_ciphertext");
    expect(updateApplyment.mock.calls.at(-1)?.[0].patch).toMatchObject({
      last_wechat_request_id: "submit-request-id",
    });
  });
  test("queries an existing business code and never resubmits when found", async () => {
    claimSubmission.mockImplementationOnce(async () => applyment({
      applyment_business_code: businessCode,
      submission_attempt_count: 2,
    }));
    const service = await createService();
    await service.submitToWechat(platformAuth(), applymentId);
    expect(queryByBusinessCode).toHaveBeenCalledTimes(1);
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  test("resubmits updated data with the same business code after rejection", async () => {
    claimSubmission.mockImplementationOnce(async () => applyment({
      applyment_business_code: businessCode,
      submission_attempt_count: 2,
    }));
    queryByBusinessCode
      .mockImplementationOnce(async () => ({
        businessCode,
        applymentId: wechatApplymentId,
        subMchid: null,
        signUrl: null,
        applymentState: "APPLYMENT_STATE_REJECTED",
        applymentStateMessage: "请修改资料",
        auditDetail: [],
        requestId: "rejected-query-id",
      }));
    const service = await createService();
    const result = await service.submitToWechat(platformAuth(), applymentId);
    expect(queryByBusinessCode).toHaveBeenCalledTimes(2);
    expect(resolveMedia).toHaveBeenCalledTimes(4);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0].request.business_code).toBe(businessCode);
    expect(result.applyment?.status).toBe("reviewing");
  });
  test("recovers a timed-out submit by querying the stable business code", async () => {
    submit.mockRejectedValueOnce(Errors.business(
      504,
      "微信支付进件请求超时",
      "WECHAT_PAY_APPLYMENT_TIMEOUT",
      { operation: "submit", requestId: null },
    ));
    const service = await createService();
    const result = await service.submitToWechat(platformAuth(), applymentId);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(queryByBusinessCode).toHaveBeenCalledTimes(1);
    expect(result.applyment?.status).toBe("reviewing");
  });
  test("never resubmits after WeChat acknowledged the first submission", async () => {
    queryByBusinessCode.mockRejectedValueOnce(Errors.business(
      504,
      "微信支付进件请求超时",
      "WECHAT_PAY_APPLYMENT_TIMEOUT",
      { operation: "query" },
    ));
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(), applymentId)).rejects
      .toMatchObject({ code: "WECHAT_PAY_APPLYMENT_TIMEOUT" });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(queryByBusinessCode).toHaveBeenCalledTimes(1);
  });
  test("retries once only after query explicitly says applyment does not exist", async () => {
    submit.mockRejectedValueOnce(Errors.business(
      504,
      "微信支付进件请求超时",
      "WECHAT_PAY_APPLYMENT_TIMEOUT",
      { operation: "submit" },
    ));
    queryByBusinessCode
      .mockRejectedValueOnce(Errors.business(
        502,
        "微信支付拒绝了进件请求",
        "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
        { operation: "query", status: 400, wechatCode: "APPLYMENT_NOT_EXIST" },
      ));
    const service = await createService();
    await service.submitToWechat(platformAuth(), applymentId);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(queryByBusinessCode).toHaveBeenCalledTimes(2);
  });

  test("stores only sanitized error metadata", async () => {
    submit.mockRejectedValueOnce(Errors.business(
      502,
      `微信拒绝 ${sensitive.identity_number}`,
      "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      {
        operation: "submit",
        requestId: "wechat-request-id",
        wechatCode: "PARAM_ERROR",
        leaked: sensitive.bank_account_number,
      },
    ));
    const service = await createService();
    await expect(service.submitToWechat(platformAuth(), applymentId)).rejects
      .toMatchObject({ code: "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED" });

    const event = insertEvent.mock.calls.at(-1)?.[0];
    expect(event?.metadata).toEqual({
      error_code: "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      operation: "submit",
      request_id: "wechat-request-id",
      wechat_code: "PARAM_ERROR",
    });
    expect(JSON.stringify(event)).not.toContain(sensitive.identity_number);
    expect(JSON.stringify(event)).not.toContain(sensitive.bank_account_number);
  });
});
