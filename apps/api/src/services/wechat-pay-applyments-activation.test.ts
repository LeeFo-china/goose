import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const paymentConfigId = "55555555-5555-4555-8555-555555555555";
const platformConfigId = "66666666-6666-4666-8666-666666666666";

const activatableApplyment: WechatPayApplymentRecord = {
  id: applymentId,
  tenant_id: tenantId,
  application_no: "WPA202607010001",
  status: "bound",
  merchant_short_name: "晴天装饰",
  license_name: "固始晴天装饰工程有限公司",
  license_code: "91411525MA00000000",
  legal_representative_name: "张三",
  super_admin_name: "李四",
  super_admin_phone_masked: "138****0000",
  super_admin_email: "admin@example.com",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_account_name: "固始晴天装饰工程有限公司",
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_account_number_masked: "62**********1234",
  settlement_account_summary: "中国银行 尾号 1234",
  business_scene_description: "装修项目收款",
  contact_address: "河南省信阳市固始县",
  attachments: [],
  audit_detail: [],
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  contact_type: "LEGAL",
  has_sensitive_payload: true,
  identity_address_masked: "河南省信阳市***1号",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
  identity_period_begin: "2020-01-01",
  identity_period_end: "2040-01-01",
  last_wechat_request_id: null,
  last_wechat_synced_at: null,
  license_address: "河南省信阳市固始县示例大道1号",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  qualification_type: "生活服务/家装服务",
  sensitive_payload_updated_at: "2026-07-01T09:00:00.000Z",
  sensitive_payload_version: 1,
  service_phone: "0376-1234567",
  settlement_id: "719",
  sign_url: null,
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  submission_attempt_count: 0,
  submission_claimed_at: null,
  wechat_applyment_state_raw: "APPLYMENT_STATE_FINISHED",
  remark: null,
  applyment_business_code: "APPLY-20260701-001",
  applyment_id: "2000002124775691",
  applyment_state: "opened",
  applyment_state_message: "已开通",
  sub_mchid: "sub-merchant-mchid",
  sub_appid: null,
  appid_binding_state: "bound",
  appid_binding_message: "平台小程序已绑定",
  payment_config_id: null,
  submitted_at: "2026-07-01T10:00:00.000Z",
  approved_at: "2026-07-01T10:30:00.000Z",
  opened_at: "2026-07-01T11:00:00.000Z",
  activated_at: null,
  rejected_at: null,
  rejected_reason: null,
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  reviewed_by_employee_id: employeeId,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T11:00:00.000Z",
  tenant: { id: tenantId, name: "固始晴天装饰", slug: "qingtian" },
};

const centralProfile: PlatformPaymentConfigRecord = {
  id: platformConfigId,
  provider: "wechat_pay",
  profile_code: "tenant_service_provider",
  principal_type: "platform",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "好店大数据服务商",
  merchant_id: "service-provider-mchid",
  sub_merchant_id: "central-sub-mchid-must-not-copy",
  app_id: "wx-service-provider-app",
  sub_app_id: "wx-central-default-sub-app",
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "SERVICE-PROVIDER-SERIAL",
  notify_url: "https://api.goodcms.cn/pay/wechat/callback",
  enabled_channels: ["project_payment", "applyment"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-01T11:30:00.000Z",
  last_validation_error_code: null,
  last_validation_error_message: null,
  last_validation_request_id: "wechat-request-id",
  risk_switches: {},
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  created_at: "2026-07-01T08:00:00.000Z",
  updated_at: "2026-07-01T11:30:00.000Z",
};

const eventRecord = {
  id: "77777777-7777-4777-8777-777777777777",
  tenant_id: tenantId,
  applyment_id: applymentId,
  event_type: "config_activated",
  from_status: "bound",
  to_status: "active",
  message: "平台激活租户微信支付配置",
  operator_employee_id: employeeId,
  metadata: {},
  created_at: "2026-07-01T12:00:00.000Z",
} satisfies WechatPayApplymentEventRecord;

const findById = mock(async () => activatableApplyment);
const findSensitivePayloadById = mock(async () => null);
const findEvents = mock(async () => [eventRecord]);
const updateApplyment = mock(async (input: {
  id: string;
  patch: Partial<WechatPayApplymentRecord>;
}) => ({ ...activatableApplyment, ...input.patch }));
const insertEvent = mock(async () => eventRecord);
const activateConfigAtomically = mock(async () => ({
  ...activatableApplyment,
  status: "active",
  payment_config_id: paymentConfigId,
  activated_at: "2026-07-01T12:00:00.000Z",
  sensitive_payload_version: null,
  sensitive_payload_updated_at: null,
  has_sensitive_payload: false,
} as WechatPayApplymentRecord));
const findPlatformProfile = mock(
  async (): Promise<PlatformPaymentConfigRecord | null> => centralProfile,
);
const upsertWechatPayConfig = mock(
  async (input: Record<string, unknown>): Promise<WechatPayConfigRecord> => ({
    id: paymentConfigId,
    tenant_id: tenantId,
    provider: "wechat_pay",
    principal_type: "tenant",
    merchant_mode: "service_provider_sub_merchant",
    merchant_name: "晴天装饰",
    merchant_id: centralProfile.merchant_id,
    sub_merchant_id: activatableApplyment.sub_mchid,
    app_id: centralProfile.app_id,
    sub_app_id: null,
    applyment_business_code: activatableApplyment.applyment_business_code,
    applyment_id: activatableApplyment.applyment_id,
    applyment_state: "opened",
    applyment_state_message: activatableApplyment.applyment_state_message,
    appid_binding_state: "bound",
    appid_binding_message: activatableApplyment.appid_binding_message,
    opened_at: activatableApplyment.opened_at,
    suspended_at: null,
    status: "active",
    enabled_at: null,
    disabled_at: null,
    enabled_channels: centralProfile.enabled_channels,
    settlement_account_summary: activatableApplyment.settlement_account_summary,
    encrypted_config_ref: centralProfile.encrypted_config_ref,
    risk_switches: {},
    serial_no: centralProfile.serial_no,
    notify_url: centralProfile.notify_url,
    validation_status: "valid",
    last_validated_at: centralProfile.last_validated_at,
    platform_payment_config_id: platformConfigId,
    created_by_employee_id: employeeId,
    updated_by_employee_id: employeeId,
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
    ...input,
  } as WechatPayConfigRecord),
);

function platformAdminAuth(): AuthContext {
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
    permissions: [],
  };
}

const unreadyProfileCases: Array<[
  string,
  PlatformPaymentConfigRecord | null,
  string,
]> = [
  ["missing", null, "PLATFORM_PAYMENT_CONFIG_MISSING"],
  ["inactive", { ...centralProfile, status: "disabled" }, "PLATFORM_PAYMENT_CONFIG_INACTIVE"],
  ["invalid", { ...centralProfile, validation_status: "invalid" }, "PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED"],
  ["incomplete", { ...centralProfile, merchant_id: null }, "PLATFORM_PAYMENT_MERCHANT_ID_MISSING"],
  ["wrong mode", { ...centralProfile, merchant_mode: "direct_merchant" }, "PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH"],
  ["missing channels", { ...centralProfile, enabled_channels: ["project_payment"] }, "PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING"],
];

async function createService() {
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  return new WechatPayApplymentService({
    repository: {
      findLatestByTenant: mock(async () => activatableApplyment),
      findById,
      findSensitivePayloadById,
      createApplyment: mock(async () => activatableApplyment),
      updateApplyment,
      activateConfigAtomically,
      insertEvent,
      findEvents,
      listApplyments: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
    },
    configRepository: {
      upsertWechatPayConfig,
      updateWechatPayConfig: mock(async () => ({ id: paymentConfigId } as WechatPayConfigRecord)),
    },
    platformPaymentConfigRepository: {
      findWechatPayConfigByProfile: findPlatformProfile,
    },
    accessPolicyService: {
      assertTenantContext: mock(() => tenantId),
      hasPermission: mock(() => false),
    },
    nowFactory: () => "2026-07-01T12:00:00.000Z",
  });
}

describe("WechatPayApplymentService activation", () => {
  beforeEach(() => {
    findById.mockClear();
    findEvents.mockClear();
    updateApplyment.mockClear();
    insertEvent.mockClear();
    activateConfigAtomically.mockClear();
    findPlatformProfile.mockClear();
    upsertWechatPayConfig.mockClear();
    findById.mockImplementation(async () => activatableApplyment);
    findPlatformProfile.mockImplementation(async () => centralProfile);
  });

  test.each(unreadyProfileCases)("rejects %s central service-provider profile", async (_, profile, blockerCode) => {
    findPlatformProfile.mockImplementationOnce(async () => profile);
    const service = await createService();

    await expect(
      service.activateConfig(platformAdminAuth(), applymentId, {}),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_PROFILE_NOT_READY",
      details: {
        profile_code: "tenant_service_provider",
        blocker_codes: expect.arrayContaining([blockerCode]),
      },
    });

    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("activates tenant config and applyment with one atomic repository call", async () => {
    const service = await createService();

    await service.activateConfig(platformAdminAuth(), applymentId, {});

    expect(findPlatformProfile).toHaveBeenCalledWith("tenant_service_provider");
    expect(activateConfigAtomically).toHaveBeenCalledWith({
      applymentId,
      expectedUpdatedAt: activatableApplyment.updated_at,
      employeeId,
      platformPaymentConfigId: platformConfigId,
    });
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
    expect(updateApplyment).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  test.each([
    ["suspended status", { status: "suspended" }],
    ["closed status", { status: "closed" }],
    ["missing raw finished state", { wechat_applyment_state_raw: null }],
    ["wrong raw state", { wechat_applyment_state_raw: "APPLYMENT_STATE_AUDITING" }],
    ["missing sub mchid", { sub_mchid: null }],
    ["tenant sub appid mode", { sub_appid: "wx-tenant-app" }],
  ])("rejects activation with %s", async (_, patch) => {
    findById.mockImplementationOnce(async () => ({
      ...activatableApplyment,
      ...patch,
    }));
    const service = await createService();

    await expect(service.activateConfig(platformAdminAuth(), applymentId, {}))
      .rejects.toMatchObject({
        code: "WECHAT_PAY_APPLYMENT_NOT_ACTIVATABLE",
      });
    expect(activateConfigAtomically).not.toHaveBeenCalled();
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });
});
