import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const existingConfig: WechatPayConfigRecord = {
  id: "config-1",
  tenant_id: "tenant-1",
  platform_payment_config_id: null,
  provider: "wechat_pay",
  principal_type: "tenant",
  merchant_mode: "direct_merchant",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-app-1",
  sub_app_id: null,
  applyment_business_code: "APPLY-20260701-001",
  applyment_id: "2000002124775691",
  applyment_state: "reviewing",
  applyment_state_message: "微信支付审核中",
  appid_binding_state: "pending_confirm",
  appid_binding_message: "等待小程序管理员确认",
  opened_at: null,
  suspended_at: null,
  status: "pending",
  enabled_at: null,
  disabled_at: null,
  enabled_channels: ["project_payment"],
  settlement_account_summary: "招商银行 尾号 1234",
  encrypted_config_ref: "secret://tenant-1/wechat-pay",
  risk_switches: {},
  merchant_name: "固始晴天装饰微信商户",
  serial_no: "1234567890abcdef",
  notify_url: "https://api.example.com/wechat-pay/notify",
  validation_status: "valid",
  last_validated_at: "2026-07-01T10:00:00.000Z",
  created_by_employee_id: "employee-old",
  updated_by_employee_id: "employee-old",
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
};

const findWechatPayConfig = mock(
  async (): Promise<WechatPayConfigRecord | null> => existingConfig,
);
const upsertWechatPayConfig = mock(async (input: unknown) => ({
  ...existingConfig,
  ...(input as Record<string, unknown>),
  id: "config-1",
  created_at: existingConfig.created_at,
  updated_at: "2026-07-01T11:00:00.000Z",
}));

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

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

async function createService() {
  const { WechatPayConfigService } = await import("./wechat-pay-configs");
  return new WechatPayConfigService({
    repository: {
      findWechatPayConfig,
      upsertWechatPayConfig,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("WechatPayConfigService", () => {
  beforeEach(() => {
    findWechatPayConfig.mockClear();
    upsertWechatPayConfig.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
    findWechatPayConfig.mockImplementation(async () => existingConfig);
  });

  test("returns masked tenant wechat pay config for config readers", async () => {
    const service = await createService();

    const result = await service.getConfig(
      authContextWithPermissions([
        { code: "wechat_pay.config.read", scope: "all" },
      ]),
    );

    expect(findWechatPayConfig).toHaveBeenCalledWith("tenant-1");
    expect(result.configured).toBe(true);
    expect(result.can_manage).toBe(false);
    expect(result.config).toMatchObject({
      principal_type: "tenant",
      merchant_name: "固始晴天装饰微信商户",
      merchant_id: "1900000001",
      applyment_business_code: "APPLY-20260701-001",
      applyment_id: "2000002124775691",
      applyment_state: "reviewing",
      applyment_state_message: "微信支付审核中",
      appid_binding_state: "pending_confirm",
      appid_binding_message: "等待小程序管理员确认",
      serial_no_masked: "12345678****cdef",
      validation_status: "valid",
      last_validated_at: "2026-07-01T10:00:00.000Z",
      has_encrypted_config_ref: true,
    });
    expect(result.config).not.toHaveProperty("serial_no");
  });

  test("keeps centrally managed service-provider config read-only", async () => {
    findWechatPayConfig.mockImplementation(async () => ({
      ...existingConfig,
      platform_payment_config_id: "platform-config-1",
      merchant_mode: "service_provider_sub_merchant",
    }));
    const service = await createService();

    const result = await service.getConfig(
      authContextWithPermissions([
        { code: "wechat_pay.config.manage", scope: "all" },
      ]),
    );

    expect(result.can_manage).toBe(false);
    expect(result.config).toMatchObject({ managed_by_platform: true });
  });

  test("rejects config save without manage permission", async () => {
    const service = await createService();

    await expect(
      service.saveConfig(
        authContextWithPermissions([
          { code: "wechat_pay.config.read", scope: "all" },
        ]),
        {
          merchant_mode: "direct_merchant",
          merchant_id: "1900000001",
          status: "pending",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("saves config with audit fields and resets validation status", async () => {
    const service = await createService();

    await service.saveConfig(
      authContextWithPermissions([
        { code: "wechat_pay.config.manage", scope: "all" },
      ]),
      {
        principal_type: "tenant",
        merchant_mode: "direct_merchant",
        merchant_name: "新商户名称",
        merchant_id: "1900000002",
        applyment_business_code: "APPLY-20260701-002",
        applyment_id: "2000002124775692",
        applyment_state: "opened",
        applyment_state_message: "已开通",
        appid_binding_state: "bound",
        appid_binding_message: "平台小程序已绑定",
        status: "active",
        enabled_channels: ["project_payment"],
        notify_url: "https://api.example.com/wechat-pay/notify",
      },
    );

    expect(upsertWechatPayConfig).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      provider: "wechat_pay",
      principal_type: "tenant",
      merchant_mode: "direct_merchant",
      merchant_name: "新商户名称",
      merchant_id: "1900000002",
      sub_merchant_id: null,
      app_id: null,
      sub_app_id: null,
      applyment_business_code: "APPLY-20260701-002",
      applyment_id: "2000002124775692",
      applyment_state: "opened",
      applyment_state_message: "已开通",
      appid_binding_state: "bound",
      appid_binding_message: "平台小程序已绑定",
      status: "active",
      enabled_channels: ["project_payment"],
      settlement_account_summary: null,
      encrypted_config_ref: "secret://tenant-1/wechat-pay",
      risk_switches: {},
      serial_no: "1234567890abcdef",
      notify_url: "https://api.example.com/wechat-pay/notify",
      validation_status: "unchecked",
      last_validated_at: null,
      created_by_employee_id: "employee-old",
      updated_by_employee_id: "employee-1",
    });
  });

  test("rejects tenant mutation of centrally managed service-provider config", async () => {
    findWechatPayConfig.mockImplementation(async () => ({
      ...existingConfig,
      platform_payment_config_id: "platform-config-1",
      merchant_mode: "service_provider_sub_merchant",
    }));
    const service = await createService();

    await expect(
      service.saveConfig(
        authContextWithPermissions([
          { code: "wechat_pay.config.manage", scope: "all" },
        ]),
        {
          merchant_mode: "service_provider_sub_merchant",
          status: "active",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_CONFIG_PLATFORM_MANAGED",
    });
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("rejects tenant creation of a service-provider config", async () => {
    findWechatPayConfig.mockImplementation(async () => null);
    const service = await createService();

    await expect(
      service.saveConfig(
        authContextWithPermissions([
          { code: "wechat_pay.config.manage", scope: "all" },
        ]),
        {
          merchant_mode: "service_provider_sub_merchant",
          status: "pending",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_CONFIG_PLATFORM_MANAGED",
    });
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });
});
