import { beforeEach, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type {
  WechatPayApplymentEventRecord,
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";
import type { WechatPayApplymentQueryResult } from "./wechat-pay-applyment-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const now = "2026-07-21T12:00:00.000Z";
const businessCode = "1561816121_WPA202607210001";

const profile: PlatformPaymentConfigRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  provider: "wechat_pay",
  profile_code: "tenant_service_provider",
  principal_type: "platform",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "服务商",
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

function applyment(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    status: "reviewing",
    applyment_business_code: businessCode,
    applyment_id: "2000002124775691",
    applyment_state: "reviewing",
    applyment_state_message: "审核中",
    wechat_applyment_state_raw: "APPLYMENT_STATE_AUDITING",
    sign_url: null,
    audit_detail: [],
    last_wechat_request_id: "old-request-id",
    last_wechat_synced_at: "2026-07-21T11:00:00.000Z",
    sub_mchid: null,
    sub_appid: null,
    appid_binding_state: "not_bound",
    appid_binding_message: null,
    opened_at: null,
    rejected_at: null,
    rejected_reason: null,
    merchant_short_name: "晴天装饰",
    application_no: "WPA202607210001",
    has_sensitive_payload: true,
    sensitive_payload_version: 1,
    submission_attempt_count: 1,
    submission_claimed_at: null,
    attachments: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  } as WechatPayApplymentRecord;
}

function queryResult(
  overrides: Partial<WechatPayApplymentQueryResult> = {},
): WechatPayApplymentQueryResult {
  return {
    businessCode,
    applymentId: "2000002124775691",
    subMchid: null,
    signUrl: null,
    applymentState: "APPLYMENT_STATE_AUDITING",
    applymentStateMessage: "审核中",
    auditDetail: [],
    requestId: "query-request-id",
    ...overrides,
  };
}

const findById = mock(async () => applyment());
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
  privateKeyPem: "service-provider-private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "wechat-public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-1",
}));
const queryByBusinessCode = mock(
  async (): Promise<WechatPayApplymentQueryResult> => queryResult(),
);

function wechatQueryNotFoundError() {
  return new AppError(502, "微信支付拒绝了进件请求", "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED", {
    operation: "query",
    status: 400,
    requestId: "not-found-request-id",
    wechatCode: "PARAM_ERROR",
    wechatMessage: "未能找到申请单",
  });
}

function platformAuth(
  ...permissions: string[]
): AuthContext {
  const permissionCodes = permissions.length > 0
    ? permissions.filter(Boolean)
    : ["platform.wechat_pay.applyment.sync"];
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
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}

async function createService() {
  const { WechatPayApplymentStatusService } = await import(
    "./wechat-pay-applyment-status"
  );
  return new WechatPayApplymentStatusService({
    repository: { findById, updateApplyment, insertEvent, findEvents },
    platformPaymentConfigRepository: {
      findWechatPayConfigByProfile: findProfile,
    },
    accessPolicyService: {
      hasPermission: (authContext, permission) =>
        authContext.permissions.some((item) => item.code === permission),
    },
    secretBundleService: { load: loadSecretBundle },
    gateway: { queryByBusinessCode },
    nowFactory: () => now,
  });
}

describe("mapWechatApplymentState", () => {
  test.each([
    ["APPLYMENT_STATE_EDITTING", "wechat_editing", "submitted"],
    ["APPLYMENT_STATE_AUDITING", "reviewing", "reviewing"],
    ["APPLYMENT_STATE_REJECTED", "rejected", "rejected"],
    ["APPLYMENT_STATE_TO_BE_CONFIRMED", "account_verifying", "account_verifying"],
    ["APPLYMENT_STATE_TO_BE_SIGNED", "signing", "signing"],
    ["APPLYMENT_STATE_SIGNING", "opening", "signing"],
    ["APPLYMENT_STATE_FINISHED", "opened", "opened"],
    ["APPLYMENT_STATE_CANCELED", "closed", "closed"],
  ] as const)("maps %s exactly", async (raw, status, normalized) => {
    const { mapWechatApplymentState } = await import(
      "./wechat-pay-applyment-status"
    );
    expect(mapWechatApplymentState({ applyment_state: raw })).toMatchObject({
      status,
      applyment_state: normalized,
      actions: expect.arrayContaining(["sync_wechat_status"]),
    });
  });

  test("exposes sign and activation actions only with official evidence", async () => {
    const { mapWechatApplymentState } = await import(
      "./wechat-pay-applyment-status"
    );
    expect(mapWechatApplymentState({
      applyment_state: "APPLYMENT_STATE_TO_BE_SIGNED",
      sign_url: "https://pay.weixin.qq.com/sign/example",
    }).actions).toEqual(["sync_wechat_status", "open_sign_url"]);
    expect(mapWechatApplymentState({
      applyment_state: "APPLYMENT_STATE_TO_BE_CONFIRMED",
      sign_url: "https://pay.weixin.qq.com/sign/example",
    }).actions).toEqual(["sync_wechat_status", "open_sign_url"]);
    expect(mapWechatApplymentState({
      applyment_state: "APPLYMENT_STATE_FINISHED",
      sub_mchid: "1900000109",
    }).actions).toEqual([
      "sync_wechat_status",
      "activate_payment_config",
    ]);
  });

  test("exposes controlled repair only to the dedicated permission", async () => {
    const { getWechatPayApplymentAvailableActions } = await import(
      "./wechat-pay-applyment-status"
    );
    const accessPolicyService = {
      hasPermission: (authContext: AuthContext, permission: string) =>
        authContext.permissions.some((item) => item.code === permission),
    };

    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth(),
      applyment: applyment(),
      accessPolicyService,
    }).map((action) => action.key)).not.toContain("repair_wechat_state");
    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth("platform.wechat_pay.applyment.repair"),
      applyment: applyment(),
      accessPolicyService,
    }).map((action) => action.key)).toContain("repair_wechat_state");
    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth("platform.wechat_pay.applyment.repair"),
      applyment: applyment({ status: "submitted" }),
      accessPolicyService,
    }).map((action) => action.key)).not.toContain("repair_wechat_state");
  });

  test("exposes review and activation actions only to their dedicated permissions", async () => {
    const { getWechatPayApplymentAvailableActions } = await import(
      "./wechat-pay-applyment-status"
    );
    const accessPolicyService = {
      hasPermission: (authContext: AuthContext, permission: string) =>
        authContext.permissions.some((item) => item.code === permission),
    };

    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth(""),
      applyment: applyment({ status: "submitted" }),
      accessPolicyService,
    }).map((action) => action.key)).toEqual([]);
    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth("platform.wechat_pay.applyment.review"),
      applyment: applyment({ status: "submitted" }),
      accessPolicyService,
    }).map((action) => action.key)).toEqual(["approve", "reject"]);

    const openedApplyment = applyment({
      status: "opened",
      applyment_state: "opened",
      wechat_applyment_state_raw: "APPLYMENT_STATE_FINISHED",
      sub_mchid: "1900000109",
      sub_appid: null,
      appid_binding_state: "bound",
    });
    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth(""),
      applyment: openedApplyment,
      accessPolicyService,
    }).map((action) => action.key)).not.toContain("activate_payment_config");
    expect(getWechatPayApplymentAvailableActions({
      authContext: platformAuth("platform.wechat_pay.config.activate"),
      applyment: openedApplyment,
      accessPolicyService,
    }).map((action) => action.key)).toContain("activate_payment_config");
  });

  test.each(["active", "suspended", "closed"])(
    "does not expose official sync for terminal status %s",
    async (status) => {
      const { getWechatPayApplymentAvailableActions } = await import(
        "./wechat-pay-applyment-status"
      );
      const accessPolicyService = {
        hasPermission: (authContext: AuthContext, permission: string) =>
          authContext.permissions.some((item) => item.code === permission),
      };

      expect(getWechatPayApplymentAvailableActions({
        authContext: platformAuth(),
        applyment: applyment({ status }),
        accessPolicyService,
      }).map((action) => action.key)).not.toContain("sync_wechat_status");
    },
  );

  test.each(["suspended", "closed"])(
    "does not expose activation for terminal status %s",
    async (status) => {
      const { getWechatPayApplymentAvailableActions } = await import(
        "./wechat-pay-applyment-status"
      );

      expect(getWechatPayApplymentAvailableActions({
        authContext: platformAuth(),
        applyment: applyment({
          status,
          wechat_applyment_state_raw: "APPLYMENT_STATE_FINISHED",
          applyment_state: "opened",
          sub_mchid: "1900000109",
          appid_binding_state: "bound",
        }),
        accessPolicyService: {
          hasPermission: () => true,
        },
      }).map((action) => action.key)).not.toContain("activate_payment_config");
    },
  );
});

describe("WechatPayApplymentStatusService", () => {
  beforeEach(() => {
    for (const fn of [
      findById,
      updateApplyment,
      insertEvent,
      findEvents,
      findProfile,
      loadSecretBundle,
      queryByBusinessCode,
    ]) fn.mockClear();
    findById.mockImplementation(async () => applyment());
    queryByBusinessCode.mockImplementation(async () => queryResult());
  });

  test("requires the dedicated sync permission", async () => {
    const service = await createService();
    await expect(service.syncWechatStatus(platformAuth(""), applymentId))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(queryByBusinessCode).not.toHaveBeenCalled();
  });

  test.each(["active", "suspended", "closed"])(
    "rejects official sync for terminal status %s before calling WeChat",
    async (status) => {
      findById.mockImplementationOnce(async () => applyment({ status }));
      const service = await createService();

      await expect(service.syncWechatStatus(platformAuth(), applymentId))
        .rejects.toMatchObject({
          statusCode: 409,
          code: "WECHAT_PAY_APPLYMENT_SYNC_NOT_ALLOWED",
        });
      expect(queryByBusinessCode).not.toHaveBeenCalled();
      expect(updateApplyment).not.toHaveBeenCalled();
    },
  );

  test("persists signed official evidence and records a changed state", async () => {
    queryByBusinessCode.mockImplementationOnce(async () => queryResult({
      applymentState: "APPLYMENT_STATE_TO_BE_SIGNED",
      applymentStateMessage: "待商户签约",
      signUrl: "https://pay.weixin.qq.com/sign/example",
      auditDetail: [{
        field: "contact_info.mobile_phone",
        fieldName: "超级管理员手机号",
        rejectReason: "号码格式不正确",
      }],
    }));
    const service = await createService();
    const result = await service.syncWechatStatus(platformAuth(
      "platform.wechat_pay.applyment.sync",
      "platform.wechat_pay.applyment.manage",
    ), applymentId);

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      expectedStatus: "reviewing",
      expectedUpdatedAt: now,
      patch: expect.objectContaining({
        status: "signing",
        applyment_state: "signing",
        wechat_applyment_state_raw: "APPLYMENT_STATE_TO_BE_SIGNED",
        sign_url: "https://pay.weixin.qq.com/sign/example",
        last_wechat_request_id: "query-request-id",
        last_wechat_synced_at: now,
        audit_detail: [{
          field: "contact_info.mobile_phone",
          field_name: "超级管理员手机号",
          reject_reason: "号码格式不正确",
        }],
      }),
    });
    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(result.available_actions.map((action) => action.key)).toEqual([
      "sync_wechat_status",
      "open_sign_url",
    ]);
  });

  test("updates sync evidence without duplicating unchanged state events", async () => {
    const service = await createService();
    await service.syncWechatStatus(platformAuth(), applymentId);

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      expectedStatus: "reviewing",
      expectedUpdatedAt: now,
      patch: expect.objectContaining({
        last_wechat_request_id: "query-request-id",
        last_wechat_synced_at: now,
      }),
    });
    expect(insertEvent).not.toHaveBeenCalled();
  });

  test("does not treat JSON object key order as an official state change", async () => {
    findById.mockImplementationOnce(async () => applyment({
      audit_detail: [{
        reject_reason: "号码格式不正确",
        field_name: "超级管理员手机号",
        field: "contact_info.mobile_phone",
      }],
    }));
    queryByBusinessCode.mockImplementationOnce(async () => queryResult({
      auditDetail: [{
        field: "contact_info.mobile_phone",
        fieldName: "超级管理员手机号",
        rejectReason: "号码格式不正确",
      }],
    }));
    const service = await createService();

    await service.syncWechatStatus(platformAuth(), applymentId);

    expect(insertEvent).not.toHaveBeenCalled();
  });

  test("restores a local applying record to approved when WeChat has no applyment", async () => {
    findById.mockImplementationOnce(async () => applyment({ status: "applying", applyment_id: null }));
    queryByBusinessCode.mockImplementationOnce(async () => {
      throw wechatQueryNotFoundError();
    });
    const service = await createService();

    await service.syncWechatStatus(
      platformAuth("platform.wechat_pay.applyment.sync", "platform.wechat_pay.applyment.submit"),
      applymentId,
    );

    expect(updateApplyment).toHaveBeenCalledWith({
      id: applymentId,
      expectedStatus: "applying",
      expectedUpdatedAt: now,
      patch: expect.objectContaining({
        status: "approved",
        submission_claimed_at: null,
        last_wechat_request_id: "not-found-request-id",
        last_wechat_synced_at: now,
        updated_by_employee_id: employeeId,
      }),
    });
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      applyment_id: applymentId,
      event_type: "wechat_applyment_missing_recovered",
      from_status: "applying",
      to_status: "approved",
      message: "微信侧未找到申请单，已恢复为可重新提交",
      operator_employee_id: employeeId,
      metadata: expect.objectContaining({
        business_code: businessCode,
        request_id: "not-found-request-id",
        wechat_code: "PARAM_ERROR",
        wechat_message: "未能找到申请单",
      }),
    }));
  });
});
