import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const paymentConfigId = "55555555-5555-4555-8555-555555555555";

const requiredAttachments = [
  ["license_copy", "license.jpg", "营业执照.jpg", 120000],
  ["legal_representative_id_card_front", "id-front.jpg", "法人身份证人像面.jpg", 90000],
  ["legal_representative_id_card_back", "id-back.jpg", "法人身份证国徽面.jpg", 92000],
].map(([category, file, fileName, size]) => ({
  category,
  object_key: `tenants/tenant-1/wechat-pay-applyment/unassigned/2026/07/02/${file}`,
  file_name: fileName,
  content_type: "image/jpeg",
  size,
}));

const submittedApplyment: WechatPayApplymentRecord = {
  id: applymentId,
  tenant_id: tenantId,
  application_no: "WPA202607010001",
  status: "submitted",
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
  attachments: requiredAttachments,
  audit_detail: [],
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  contact_type: null,
  has_sensitive_payload: false,
  identity_address_masked: null,
  identity_doc_type: null,
  identity_period_begin: null,
  identity_period_end: null,
  last_wechat_request_id: null,
  last_wechat_synced_at: null,
  license_address: null,
  license_period_begin: null,
  license_period_end: null,
  qualification_type: null,
  sensitive_payload_ciphertext: null,
  sensitive_payload_updated_at: null,
  sensitive_payload_version: null,
  service_phone: null,
  settlement_id: null,
  sign_url: null,
  subject_type: null,
  submission_attempt_count: 0,
  submission_claimed_at: null,
  wechat_applyment_state_raw: null,
  remark: "首次申请",
  applyment_business_code: null,
  applyment_id: null,
  applyment_state: "submitted",
  applyment_state_message: null,
  sub_mchid: null,
  sub_appid: null,
  appid_binding_state: "not_bound",
  appid_binding_message: null,
  payment_config_id: null,
  submitted_at: "2026-07-01T10:00:00.000Z",
  approved_at: null,
  opened_at: null,
  activated_at: null,
  rejected_at: null,
  rejected_reason: null,
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  reviewed_by_employee_id: null,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
  tenant: { id: tenantId, name: "固始晴天装饰", slug: "qingtian" },
};

const eventRecord: WechatPayApplymentEventRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  tenant_id: tenantId,
  applyment_id: applymentId,
  event_type: "submitted",
  from_status: "draft",
  to_status: "submitted",
  message: "租户提交微信支付开通申请",
  operator_employee_id: employeeId,
  metadata: {},
  created_at: "2026-07-01T10:00:00.000Z",
};

const findLatestByTenant = mock(async (): Promise<WechatPayApplymentRecord | null> => submittedApplyment);
const findById = mock(async (): Promise<WechatPayApplymentRecord | null> => submittedApplyment);
const findEvents = mock(async () => [eventRecord]);
const createApplyment = mock(async (input: Partial<WechatPayApplymentRecord>) => ({
  ...submittedApplyment,
  ...input,
  id: applymentId,
  status: input.status || "draft",
}));
const updateApplyment = mock(async (input: {
  id: string;
  tenantId?: string;
  patch: Partial<WechatPayApplymentRecord>;
}) => ({
  ...submittedApplyment,
  ...input.patch,
  id: input.id,
}));
const insertEvent = mock(async () => eventRecord);
const listApplyments = mock(async () => ({
  list: [submittedApplyment],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
}));
const upsertWechatPayConfig = mock(
  async (input: Record<string, unknown>): Promise<WechatPayConfigRecord> => ({
    app_id: null,
    appid_binding_message: null,
    appid_binding_state: "bound",
    applyment_business_code: null,
    applyment_id: null,
    applyment_state: "opened",
    applyment_state_message: null,
    created_at: "2026-07-01T12:00:00.000Z",
    created_by_employee_id: employeeId,
    disabled_at: null,
    enabled_at: null,
    enabled_channels: ["project_payment"],
    encrypted_config_ref: "secret://tenant/wechat-pay",
    id: paymentConfigId,
    last_validated_at: null,
    merchant_id: null,
    merchant_mode: "service_provider_sub_merchant",
    merchant_name: null,
    notify_url: null,
    opened_at: null,
    principal_type: "tenant",
    provider: "wechat_pay",
    risk_switches: {},
    serial_no: null,
    settlement_account_summary: null,
    status: "active",
    sub_app_id: null,
    sub_merchant_id: null,
    suspended_at: null,
    tenant_id: tenantId,
    updated_at: "2026-07-01T12:00:00.000Z",
    updated_by_employee_id: employeeId,
    validation_status: "unchecked",
    ...input,
  } as WechatPayConfigRecord),
);
const updateWechatPayConfig = mock(async () => ({
  id: paymentConfigId,
  tenant_id: tenantId,
  provider: "wechat_pay",
  status: "disabled",
} as WechatPayConfigRecord));
const applicationNoFactory = mock(() => "WPA202607010001");
const nowFactory = mock(() => "2026-07-01T12:00:00.000Z");

const accessPolicy = {
  assertTenantContext: mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw Object.assign(new Error("缺少租户上下文"), {
        statusCode: 403,
        code: "TENANT_CONTEXT_REQUIRED",
      });
    }
    return authContext.tenantId;
  }),
  hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
    authContext.permissions.some((permission) => permission.code === permissionCode)
  ),
};

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId,
    tenantId,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "租户管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "ADMIN",
    departmentName: "管理部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions,
    ...overrides,
  };
}

const tenantReadAuth = () =>
  authContextWithPermissions([{ code: "wechat_pay.applyment.read", scope: "all" }]);

const tenantSubmitAuth = () =>
  authContextWithPermissions([{ code: "wechat_pay.applyment.submit", scope: "all" }]);

const platformAdminAuth = () =>
  authContextWithPermissions([], {
    tenantId: null,
    isPlatformAdmin: true,
    roleCodes: ["platform_admin"],
  });

async function createService() {
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  return new WechatPayApplymentService({
    repository: {
      findLatestByTenant,
      findById,
      findEvents,
      createApplyment,
      updateApplyment,
      insertEvent,
      listApplyments,
    },
    configRepository: {
      upsertWechatPayConfig,
      updateWechatPayConfig,
    },
    accessPolicyService: accessPolicy,
    applicationNoFactory,
    nowFactory,
  });
}

describe("WechatPayApplymentService", () => {
  beforeEach(() => {
    findLatestByTenant.mockClear();
    findById.mockClear();
    findEvents.mockClear();
    createApplyment.mockClear();
    updateApplyment.mockClear();
    insertEvent.mockClear();
    listApplyments.mockClear();
    upsertWechatPayConfig.mockClear();
    updateWechatPayConfig.mockClear();
    applicationNoFactory.mockClear();
    nowFactory.mockClear();
    findLatestByTenant.mockImplementation(async () => submittedApplyment);
    findById.mockImplementation(async () => submittedApplyment);
  });

  test("returns current tenant applyment with events for readers", async () => {
    const service = await createService();
    const result = await service.getCurrent(tenantReadAuth());
    expect(findLatestByTenant).toHaveBeenCalledWith(tenantId);
    expect(findEvents).toHaveBeenCalledWith({ tenantId, applymentId });
    expect(result.applyment?.application_no).toBe("WPA202607010001");
    expect(result.events).toHaveLength(1);
    expect(result.can_submit).toBe(false);
  });

  test("creates tenant draft and stores only masked admin phone", async () => {
    findLatestByTenant.mockImplementationOnce(async () => null);
    const service = await createService();

    await service.createDraft(
      tenantSubmitAuth(),
      {
        merchant_short_name: "晴天装饰",
        license_name: "固始晴天装饰工程有限公司",
        license_code: "91411525MA00000000",
        legal_representative_name: "张三",
        super_admin_name: "李四",
        super_admin_phone: "13800000000",
        super_admin_email: "admin@example.com",
        settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
        settlement_account_name: "固始晴天装饰工程有限公司",
        settlement_bank_name: "中国银行",
        settlement_bank_full_name: "中国银行股份有限公司固始支行",
        settlement_bank_branch_id: "104515080123",
        settlement_account_number: "6212345678901234",
        business_scene_description: "装修项目收款",
        contact_address: "河南省信阳市固始县",
      },
    );

    expect(createApplyment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        application_no: "WPA202607010001",
        status: "draft",
        super_admin_phone_masked: "138****0000",
        settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
        settlement_account_number_masked: "62**********1234",
        settlement_account_summary: "中国银行 尾号 1234",
        created_by_employee_id: employeeId,
      }),
    );
    expect(JSON.stringify(createApplyment.mock.calls[0]?.[0])).not.toContain("13800000000");
    expect(JSON.stringify(createApplyment.mock.calls[0]?.[0])).not.toContain("6212345678901234");
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "created",
      to_status: "draft",
    }));
  });

  test("submits rejected or draft applyment and records audit event", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment,
      status: "rejected",
      rejected_reason: "缺少结算账户摘要",
    }));
    const service = await createService();

    await service.submit(tenantSubmitAuth(), applymentId, { remark: "已补充资料" });

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      tenantId,
      patch: expect.objectContaining({
        status: "submitted",
        applyment_state: "submitted",
        submitted_at: "2026-07-01T12:00:00.000Z",
        rejected_reason: null,
      }),
    });
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "submitted",
      from_status: "rejected",
      to_status: "submitted",
    }));
  });

  test("hides closed tenant applyment from current draft entry", async () => {
    findLatestByTenant.mockImplementationOnce(async () => ({
      ...submittedApplyment,
      status: "closed",
      applyment_state: "closed",
    }));
    const service = await createService();
    const result = await service.getCurrent(tenantSubmitAuth());
    expect(result.applyment).toBeNull();
    expect(result.events).toEqual([]);
    expect(result.can_submit).toBe(false);
  });
  test("rejects submit when required applyment attachments are missing", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment, status: "draft", attachments: [],
    }));
    const service = await createService();

    await expect(
      service.submit(tenantSubmitAuth(), applymentId, {}),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
      details: {
        missing: [
          "attachments.license_copy",
          "attachments.legal_representative_id_card_front",
          "attachments.legal_representative_id_card_back",
        ],
      },
    });
  });

  test("rejects submit when bank account number has not been captured", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment, status: "draft", settlement_account_number_masked: null,
    }));
    const service = await createService();

    await expect(
      service.submit(tenantSubmitAuth(), applymentId, {}),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
      details: expect.objectContaining({
        missing: expect.arrayContaining(["settlement_account_number_masked"]),
      }),
    });
  });
  test("platform approves rejects and lists with pagination", async () => {
    const service = await createService();
    const platformAuth = platformAdminAuth();

    const list = await service.listForPlatform(platformAuth, {
      page: 1,
      pageSize: 20,
      status: "submitted",
    });
    await service.approve(platformAuth, applymentId, { message: "资料合规" });
    await service.reject(platformAuth, applymentId, { reason: "法人信息不一致" });

    expect(list.pagination.total).toBe(1);
    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      patch: expect.objectContaining({
        status: "approved",
        reviewed_by_employee_id: employeeId,
      }),
    });
    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      patch: expect.objectContaining({
        status: "rejected",
        rejected_reason: "法人信息不一致",
      }),
    });
  });

  test("platform closes active applyment through wechat status callback", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment,
      status: "active",
      applyment_state: "opened",
      appid_binding_state: "bound",
      sub_mchid: "1900000002",
      sub_appid: "wxbac3b1e168fd968a",
      payment_config_id: paymentConfigId,
    }));
    const service = await createService();
    const platformAuth = platformAdminAuth();

    await service.updateWechatStatus(platformAuth, applymentId, {
      applyment_state: "closed",
      applyment_state_message: "测试申请关闭，允许租户重新提交真实资料",
    });

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      patch: expect.objectContaining({
        status: "closed",
        applyment_state: "closed",
        applyment_state_message: "测试申请关闭，允许租户重新提交真实资料",
      }),
    });
    expect(updateWechatPayConfig).toHaveBeenCalledWith({
      id: paymentConfigId,
      patch: expect.objectContaining({
        status: "disabled",
        disabled_at: "2026-07-01T12:00:00.000Z",
        suspended_at: null,
        updated_by_employee_id: employeeId,
      }),
    });
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "wechat_status_updated",
      from_status: "active",
      to_status: "closed",
    }));
  });
});
