import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";
import type {
  WechatPayApplymentPreflightReport,
  WechatPayApplymentRepositoryPort,
} from "@/services/wechat-pay-applyments-types";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const applymentId = "33333333-3333-4333-8333-333333333333";
const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";

const submittedApplyment: WechatPayApplymentRecord = {
  id: applymentId,
  tenant_id: tenantId,
  application_no: "WPA202607010001",
  status: "submitted",
  draft_epoch: 1,
  draft_revision: 0,
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
  settlement_account_number_masked: "62**********1234",
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_account_summary: "中国银行 尾号 1234",
  settlement_id: "719",
  qualification_type: "零售",
  business_scene_description: "装修项目收款",
  contact_address: "河南省信阳市固始县",
  attachments: [],
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
  sensitive_payload_updated_at: "2026-07-01T09:00:00.000Z",
  submission_claimed_at: null,
  submission_attempt_count: 0,
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

let currentApplyment = submittedApplyment;
const findById = mock(async () => currentApplyment);
const updateApplyment = mock(async () => currentApplyment);
const submitOfficialApplyment = mock(async () => ({
  applyment: currentApplyment,
  events: [],
  can_edit: false,
  can_submit: false,
  available_actions: [],
}));
const runPreflight = mock(
  async (): Promise<WechatPayApplymentPreflightReport> => ({
    ready: true,
    blockers: [],
  }),
);

const repository: WechatPayApplymentRepositoryPort = {
  findLatestByTenant: async () => currentApplyment,
  findById,
  findSensitivePayloadById: async () => null,
  createApplyment: async () => unreachable(),
  updateApplyment,
  updateTenantDraftAtomically: async () => unreachable(),
  claimTenantDraftSession: async () => unreachable(),
  submitTenantApplymentAtomically: async () => unreachable(),
  activateConfigAtomically: async () => unreachable(),
  insertEvent: async () => eventRecord,
  findEvents: async () => [],
  listApplyments: async ({ query }) => ({
    list: [currentApplyment],
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: 1,
      totalPages: 1,
    },
  }),
};

function platformAuth(permissions: AuthContext["permissions"] = []): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "PLATFORM",
    departmentName: "平台",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [
      { code: "platform.wechat_pay.applyment.read", scope: "all" },
      { code: "platform.wechat_pay.applyment.review", scope: "all" },
      ...permissions,
    ],
  };
}

async function createActions() {
  const { WechatPayApplymentPlatformActions } = await import(
    "./wechat-pay-applyments-platform"
  );
  return new WechatPayApplymentPlatformActions(
    repository,
    {
      upsertWechatPayConfig: async () => unreachable(),
      updateWechatPayConfig: async () => unreachable(),
    },
    { findWechatPayConfigByProfile: async () => null },
    () => "2026-07-01T12:00:00.000Z",
    { submitToWechat: submitOfficialApplyment },
    { syncWechatStatus: async () => unreachable() },
    {
      hasPermission: (authContext, code) =>
        authContext.permissions.some((permission) => permission.code === code),
    },
    { run: runPreflight },
  );
}

describe("WechatPayApplymentPlatformActions readiness", () => {
  beforeEach(() => {
    currentApplyment = submittedApplyment;
    findById.mockClear();
    updateApplyment.mockClear();
    submitOfficialApplyment.mockClear();
    runPreflight.mockClear();
    runPreflight.mockImplementation(async () => ({ ready: true, blockers: [] }));
  });

  test("requires each declared platform permission before repository access", async () => {
    const actions = await createActions();
    const auth = { ...platformAuth(), permissions: [] };
    const operations = [
      () => actions.listForPlatform(auth, { page: 1, pageSize: 20 }),
      () => actions.getPlatformDetail(auth, applymentId),
      () => actions.approve(auth, applymentId, {}),
      () => actions.reject(auth, applymentId, { reason: "资料不完整" }),
      () => actions.markApplying(auth, applymentId, {}),
      () => actions.activateConfig(auth, applymentId),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    expect(findById).not.toHaveBeenCalled();
    expect(updateApplyment).not.toHaveBeenCalled();
  });

  test("hides approval when application preflight is incomplete", async () => {
    runPreflight.mockImplementationOnce(async () => ({
      ready: false,
      blockers: [{
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: "service_phone",
      }],
    }));
    const detail = await (await createActions()).getPlatformDetail(
      platformAuth(),
      applymentId,
    );

    expect(detail.submission_readiness).toEqual({
      ready: false,
      review_ready: false,
      blockers: [{
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: "service_phone",
      }],
    });
    expect(detail.available_actions.map((action) => action.key)).toEqual([
      "reject",
    ]);
  });

  test("rejects incomplete approval before mutation", async () => {
    runPreflight.mockImplementationOnce(async () => ({
      ready: false,
      blockers: [{ code: "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" }],
    }));

    await expect(
      (await createActions()).approve(platformAuth(), applymentId, {}),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_APPLYMENT_REVIEW_NOT_READY",
      details: {
        blocker_codes: ["APPLYMENT_SENSITIVE_PAYLOAD_MISSING"],
      },
    });
    expect(updateApplyment).not.toHaveBeenCalled();
  });

  test("keeps approval available when only platform configuration is blocked", async () => {
    runPreflight.mockImplementationOnce(async () => ({
      ready: false,
      blockers: [
        { code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" },
        { code: "PLATFORM_PAYMENT_CONFIG_MISSING" },
      ],
    }));
    const detail = await (await createActions()).getPlatformDetail(
      platformAuth(),
      applymentId,
    );

    expect(detail.submission_readiness?.review_ready).toBe(true);
    expect(detail.available_actions.map((action) => action.key)).toEqual([
      "approve",
      "reject",
    ]);
  });

  test("hides submit action until the full preflight is ready", async () => {
    currentApplyment = { ...submittedApplyment, status: "approved" };
    runPreflight.mockImplementationOnce(async () => ({
      ready: false,
      blockers: [{ code: "PLATFORM_PAYMENT_CONFIG_MISSING" }],
    }));
    const detail = await (await createActions()).getPlatformDetail(
      platformAuth([{
        code: "platform.wechat_pay.applyment.submit",
        scope: "all",
      }]),
      applymentId,
    );

    expect(detail.available_actions).not.toContainEqual(
      expect.objectContaining({ key: "submit_to_wechat" }),
    );
    expect(detail.available_actions).toContainEqual(
      expect.objectContaining({ key: "reject" }),
    );
  });

  test("blocks the submit endpoint before invoking WeChat", async () => {
    runPreflight.mockImplementationOnce(async () => ({
      ready: false,
      blockers: [{ code: "PLATFORM_PAYMENT_CONFIG_MISSING" }],
    }));

    await expect(
      (await createActions()).submitToWechat(platformAuth([{
        code: "platform.wechat_pay.applyment.submit",
        scope: "all",
      }]), applymentId),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_APPLYMENT_PREFLIGHT_BLOCKED",
      details: {
        blocker_codes: ["PLATFORM_PAYMENT_CONFIG_MISSING"],
      },
    });
    expect(submitOfficialApplyment).not.toHaveBeenCalled();
  });

  test("checks submit permission before running preflight", async () => {
    await expect(
      (await createActions()).submitToWechat(platformAuth(), applymentId),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(runPreflight).not.toHaveBeenCalled();
    expect(submitOfficialApplyment).not.toHaveBeenCalled();
  });

  test("rejects local review changes after the application reached WeChat", async () => {
    currentApplyment = {
      ...submittedApplyment,
      status: "reviewing",
      applyment_state: "reviewing",
      wechat_applyment_state_raw: "APPLYMENT_STATE_AUDITING",
    };

    await expect(
      (await createActions()).reject(platformAuth(), applymentId, {
        reason: "不应覆盖微信官方审核状态",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_APPLYMENT_STATUS_INVALID",
    });
    expect(updateApplyment).not.toHaveBeenCalled();
  });

  test("does not report submission readiness after the lifecycle has advanced", async () => {
    currentApplyment = { ...submittedApplyment, status: "active" };

    const detail = await (await createActions()).getPlatformDetail(
      platformAuth(),
      applymentId,
    );

    expect(detail.submission_readiness).toBeUndefined();
    expect(runPreflight).not.toHaveBeenCalled();
  });
});

function unreachable(): never {
  throw Errors.business(500, "测试桩不应被调用", "TEST_STUB_UNEXPECTED_CALL");
}
