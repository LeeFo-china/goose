import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentInsert,
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";
import {
  decryptApplymentSensitivePayload,
  encryptApplymentSensitivePayload,
} from "@/services/wechat-pay-applyment-sensitive-payload";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rootSecret = "test-applyment-root-secret";
const now = "2026-07-01T12:00:00.000Z";

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

const applyment: WechatPayApplymentRecord = {
  activated_at: null,
  appid_binding_message: null,
  appid_binding_state: "not_bound",
  application_no: "WPA202607010001",
  applyment_business_code: null,
  applyment_id: null,
  applyment_state: "draft",
  applyment_state_message: null,
  approved_at: null,
  attachments: [],
  audit_detail: [],
  business_scene_description: "装修项目收款",
  contact_address: "河南省信阳市固始县",
  contact_identity_doc_type: null,
  contact_identity_period_begin: null,
  contact_identity_period_end: null,
  contact_type: "LEGAL",
  created_at: now,
  created_by_employee_id: employeeId,
  has_sensitive_payload: true,
  id: applymentId,
  identity_address_masked: "河南省信阳市***1号",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
  identity_period_begin: "2020-01-01",
  identity_period_end: "2040-01-01",
  last_wechat_request_id: null,
  last_wechat_synced_at: null,
  legal_representative_name: "张三",
  license_address: "河南省信阳市固始县示例大道1号",
  license_code: "91411525MA00000000",
  license_name: "固始晴天装饰工程有限公司",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  merchant_short_name: "晴天装饰",
  opened_at: null,
  payment_config_id: null,
  qualification_type: "生活服务/家装服务",
  rejected_at: null,
  rejected_reason: null,
  remark: null,
  reviewed_by_employee_id: null,
  sensitive_payload_updated_at: now,
  sensitive_payload_version: 1,
  service_phone: "0376-1234567",
  settlement_account_name: "固始晴天装饰工程有限公司",
  settlement_account_number_masked: "62**********1234",
  settlement_account_summary: "中国银行 尾号 1234",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_bank_branch_id: "104515080123",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_name: "中国银行",
  settlement_id: "719",
  sign_url: null,
  status: "draft",
  sub_appid: null,
  sub_mchid: null,
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  submission_attempt_count: 0,
  submission_claimed_at: null,
  submitted_at: null,
  super_admin_email: "admin@example.com",
  super_admin_name: "李四",
  super_admin_phone_masked: "138****0000",
  tenant_id: tenantId,
  updated_at: now,
  updated_by_employee_id: employeeId,
  wechat_applyment_state_raw: null,
};

const event: WechatPayApplymentEventRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  tenant_id: tenantId,
  applyment_id: applymentId,
  event_type: "updated",
  from_status: "draft",
  to_status: "draft",
  message: null,
  operator_employee_id: employeeId,
  metadata: {},
  created_at: now,
};

const findLatestByTenant = mock(async () => null as WechatPayApplymentRecord | null);
const findById = mock(async () => applyment as WechatPayApplymentRecord | null);
const findSensitivePayloadById = mock(async () => ({
  id: applymentId,
  tenant_id: tenantId,
  has_sensitive_payload: true,
  sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
    context: { tenantId, applymentId, version: 1 },
    payload: sensitivePayload,
    rootSecret,
  }),
  sensitive_payload_version: 1,
}));
const createApplyment = mock(async (input: WechatPayApplymentInsert) => ({
  ...applyment,
  ...input,
}) as unknown as WechatPayApplymentRecord);
const updateApplyment = mock(async (input: {
  id: string;
  tenantId?: string;
  patch: WechatPayApplymentUpdate;
}) => ({ ...applyment, ...input.patch }) as unknown as WechatPayApplymentRecord);
const insertEvent = mock(async () => event);
const findEvents = mock(async () => [event]);

const authContext: AuthContext = {
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
  permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
};

async function createService() {
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  return new WechatPayApplymentService({
    repository: {
      findLatestByTenant,
      findById,
      findSensitivePayloadById,
      createApplyment,
      updateApplyment,
      insertEvent,
      findEvents,
      listApplyments: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
    },
    configRepository: {
      upsertWechatPayConfig: mock(async () => ({} as WechatPayConfigRecord)),
      updateWechatPayConfig: mock(async () => ({} as WechatPayConfigRecord)),
    },
    accessPolicyService: {
      assertTenantContext: mock(() => tenantId),
      hasPermission: mock(() => true),
    },
    applicationNoFactory: () => "WPA202607010001",
    applymentIdFactory: () => applymentId,
    encryptionRootSecretFactory: () => rootSecret,
    nowFactory: () => now,
  });
}

const createInput = {
  subject_type: "SUBJECT_TYPE_ENTERPRISE" as const,
  merchant_short_name: "晴天装饰",
  license_name: "固始晴天装饰工程有限公司",
  license_code: "91411525MA00000000",
  license_address: "河南省信阳市固始县示例大道1号",
  license_period_begin: "2020-01-01",
  license_period_end: "长期" as const,
  legal_representative_name: "张三",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD" as const,
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  identity_period_begin: "2020-01-01",
  identity_period_end: "2040-01-01",
  contact_type: "LEGAL" as const,
  super_admin_name: "李四",
  super_admin_phone: "13800000000",
  super_admin_email: "admin@example.com",
  service_phone: "0376-1234567",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE" as const,
  settlement_account_name: "固始晴天装饰工程有限公司",
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_account_number: "6212345678901234",
  settlement_id: "719",
  qualification_type: "生活服务/家装服务",
  business_scene_description: "装修项目收款",
  contact_address: "河南省信阳市固始县",
};

describe("WechatPayApplymentService sensitive persistence", () => {
  beforeEach(() => {
    findLatestByTenant.mockClear();
    findById.mockClear();
    findSensitivePayloadById.mockClear();
    createApplyment.mockClear();
    updateApplyment.mockClear();
    insertEvent.mockClear();
    findEvents.mockClear();
    findLatestByTenant.mockImplementation(async () => null);
    findById.mockImplementation(async () => applyment);
  });

  test("creates a draft with safe projections and encrypted sensitive data", async () => {
    const service = await createService();
    await service.createDraft(authContext, createInput);

    const insert = createApplyment.mock.calls[0]?.[0];
    expect(insert).toEqual(expect.objectContaining({
      id: applymentId,
      super_admin_phone_masked: "138****0000",
      settlement_account_number_masked: "62**********1234",
      has_sensitive_payload: true,
      sensitive_payload_version: 1,
      sensitive_payload_ciphertext: expect.stringMatching(/^wpa:v1:/),
    }));
    expect(JSON.stringify(insert)).not.toContain("13800000000");
    expect(JSON.stringify(insert)).not.toContain("6212345678901234");
    expect(decryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      ciphertext: insert?.sensitive_payload_ciphertext ?? "",
      rootSecret,
    })).toEqual(sensitivePayload);
  });

  test("merges a partial sensitive replacement", async () => {
    const service = await createService();
    await service.updateDraft(authContext, applymentId, {
      super_admin_phone: "13900000000",
    });

    const patch = updateApplyment.mock.calls[0]?.[0]?.patch;
    expect(findSensitivePayloadById).toHaveBeenCalledWith({
      id: applymentId,
      tenantId,
    });
    expect(patch?.super_admin_phone_masked).toBe("139****0000");
    expect(decryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      ciphertext: patch?.sensitive_payload_ciphertext ?? "",
      rootSecret,
    })).toEqual({ ...sensitivePayload, contact_phone: "13900000000" });
  });

  test("requires replacements for a legacy draft without ciphertext", async () => {
    findById.mockImplementationOnce(async () => ({
      ...applyment,
      has_sensitive_payload: false,
      sensitive_payload_version: null,
    }));
    const service = await createService();

    await expect(service.updateDraft(authContext, applymentId, {
      merchant_short_name: "更新后的简称",
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_SENSITIVE_FIELDS_MISSING",
      details: {
        missing: expect.arrayContaining([
          "identity_number",
          "contact_phone",
          "bank_account_number",
        ]),
      },
    });
  });

  test("strips ciphertext from detail responses", async () => {
    findLatestByTenant.mockImplementationOnce(async () => ({
      ...applyment,
      sensitive_payload_ciphertext: "must-not-leak",
    } as unknown as WechatPayApplymentRecord));
    const service = await createService();

    const result = await service.getCurrent(authContext);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(result.applyment).not.toHaveProperty("sensitive_payload_ciphertext");
  });
});
