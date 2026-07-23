import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentEventRecord,
  WechatPayApplymentInsert,
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import { encryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
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
  ocr_review_status: "manual",
}));
const submittedApplyment: WechatPayApplymentRecord = {
  id: applymentId,
  tenant_id: tenantId,
  application_no: "WPA202607010001",
  status: "submitted",
  draft_epoch: 1,
  draft_revision: 0,
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
  qualification_type: "零售批发/生活娱乐/网上商城/其他",
  sensitive_payload_updated_at: "2026-07-01T09:00:00.000Z",
  sensitive_payload_version: 1,
  service_phone: "0376-1234567",
  settlement_id: "716",
  sign_url: null,
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
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
const sensitiveCiphertext = encryptApplymentSensitivePayload({
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
  rootSecret: "test-applyment-root-secret",
});
const findSensitivePayloadById = mock(async () => ({
  id: applymentId,
  tenant_id: tenantId,
  has_sensitive_payload: true,
  sensitive_payload_ciphertext: sensitiveCiphertext,
  sensitive_payload_version: 1,
}));
const findOcrRecognitionsByIds = mock(async () => [] as Array<{
  id: string;
  tenant_id: string;
  file_object_id: string;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  scene: string;
  document_type: string;
}>);
const findEvents = mock(async () => [eventRecord]);
const createApplyment = mock(async (input: WechatPayApplymentInsert) => ({
  ...submittedApplyment,
  ...input,
  id: applymentId,
  status: input.status || "draft",
}));
const updateApplyment = mock(async (input: {
  id: string;
  tenantId?: string;
  patch: WechatPayApplymentUpdate;
}) => ({
  ...submittedApplyment,
  ...input.patch,
  id: input.id,
}));
const insertEvent = mock(
  async (_input: WechatPayApplymentEventInsert) => eventRecord,
);
const submitTenantApplymentAtomically = mock(async () => submittedApplyment);
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
const tenantReadAuth = () => authContextWithPermissions([
  { code: "wechat_pay.applyment.read", scope: "all" },
]);
const tenantSubmitAuth = () => authContextWithPermissions([
  { code: "wechat_pay.applyment.submit", scope: "all" },
]);
const platformAdminAuth = (permissions: AuthContext["permissions"] = []) =>
  authContextWithPermissions(permissions, {
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
      findSensitivePayloadById,
      findEvents,
      createApplyment,
      updateApplyment,
      updateTenantDraftAtomically: async () => (
        { outcome: "applied", applyment: submittedApplyment }
      ),
      claimTenantDraftSession: async () => submittedApplyment,
      submitTenantApplymentAtomically,
      activateConfigAtomically: mock(async () => submittedApplyment),
      insertEvent,
      listApplyments,
    },
    configRepository: {
      upsertWechatPayConfig,
      updateWechatPayConfig,
    },
    accessPolicyService: accessPolicy,
    applicationNoFactory,
    encryptionRootSecretFactory: () => "test-applyment-root-secret",
    ocrRecognitionRepository: {
      findByIdsForTenant: findOcrRecognitionsByIds,
    },
    nowFactory,
    preflightService: {
      run: async () => ({ ready: true, blockers: [] }),
    },
  });
}
describe("WechatPayApplymentService", () => {
  beforeEach(() => {
    findLatestByTenant.mockClear();
    findById.mockClear();
    findSensitivePayloadById.mockClear();
    findOcrRecognitionsByIds.mockClear();
    findEvents.mockClear();
    createApplyment.mockClear();
    updateApplyment.mockClear();
    submitTenantApplymentAtomically.mockClear();
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
    expect(result.can_edit).toBe(false);
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
    expect(result.can_edit).toBe(false);
    findLatestByTenant.mockImplementation(async () => null);
    const empty = await service.getCurrent(tenantSubmitAuth());
    expect(empty.can_edit).toBe(true);
    expect(empty.can_submit).toBe(false);
  });
  test("rejects submit when required applyment attachments are missing", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment, status: "draft", attachments: [],
    }));
    const service = await createService();
    await expect(
      service.submit(tenantSubmitAuth(), applymentId, {
        idempotency_key: applymentId,
      }),
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
      service.submit(tenantSubmitAuth(), applymentId, {
        idempotency_key: applymentId,
      }),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
      details: expect.objectContaining({
        missing: expect.arrayContaining(["settlement_account_number_masked"]),
      }),
    });
  });
  test("rejects submit when the encrypted sensitive payload is missing", async () => {
    findById.mockImplementationOnce(async () => ({
      ...submittedApplyment,
      status: "draft",
      has_sensitive_payload: false,
      sensitive_payload_version: null,
      sensitive_payload_updated_at: null,
    }));
    const service = await createService();
    await expect(
      service.submit(tenantSubmitAuth(), applymentId, {
        idempotency_key: applymentId,
      }),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
      details: expect.objectContaining({
        missing: expect.arrayContaining(["sensitive_payload"]),
      }),
    });
  });
  test("platform approves rejects and lists with pagination", async () => {
    const service = await createService();
    const platformAuth = platformAdminAuth([
      { code: "platform.wechat_pay.applyment.read", scope: "all" },
      { code: "platform.wechat_pay.applyment.review", scope: "all" },
    ]);
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
      expectedStatus: "submitted",
      expectedUpdatedAt: "2026-07-01T10:00:00.000Z",
      patch: expect.objectContaining({
        status: "approved",
        reviewed_by_employee_id: employeeId,
      }),
    });
    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      expectedStatus: "submitted",
      expectedUpdatedAt: "2026-07-01T10:00:00.000Z",
      patch: expect.objectContaining({
        status: "rejected",
        rejected_reason: "法人信息不一致",
      }),
    });
  });
  test("platform repairs an active applyment with dedicated permission", async () => {
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
    const platformAuth = platformAdminAuth([{
      code: "platform.wechat_pay.applyment.repair",
      scope: "all",
    }]);
    await service.repairWechatState(platformAuth, applymentId, {
      applyment_state: "closed",
      applyment_state_message: "测试申请关闭，允许租户重新提交真实资料",
      reason: "微信运营工单确认关闭测试申请",
    });

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      expectedStatus: "active",
      expectedUpdatedAt: "2026-07-01T10:00:00.000Z",
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
      event_type: "wechat_state_repaired",
      from_status: "active",
      to_status: "closed",
      message: "微信运营工单确认关闭测试申请",
    }));
  });
  test("platform rejects state repair without the dedicated permission", async () => {
    const service = await createService();
    await expect(service.repairWechatState(platformAdminAuth(), applymentId, {
      applyment_state: "closed",
      reason: "微信运营工单确认关闭测试申请",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(updateApplyment).not.toHaveBeenCalled();
  });
});
