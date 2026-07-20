import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentConfigUpsertInput,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const existingConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "好店平台微信商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://platform/wechat-pay",
  serial_no: "1234567890abcdef",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 3,
  last_validated_at: "2026-07-02T08:00:00.000Z",
  last_validation_error_code: "OLD_VALIDATION_ERROR",
  last_validation_error_message: "旧验证错误",
  last_validation_request_id: "old-request-id",
  risk_switches: {},
  created_by_employee_id: "employee-old",
  updated_by_employee_id: "employee-old",
  created_at: "2026-07-02T07:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const serviceProviderConfig = {
  ...existingConfig,
  id: "platform-config-2",
  profile_code: "tenant_service_provider",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "好店大数据服务商",
  merchant_id: "190000SP01",
  app_id: "wx-service-provider-app",
  sub_merchant_id: null,
  sub_app_id: null,
  encrypted_config_ref:
    "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  serial_no: "SERVICEPROVIDERSERIALNO",
  enabled_channels: ["project_payment", "applyment"],
} satisfies PlatformPaymentConfigRecord;

const findWechatPayConfig = mock(async (): Promise<PlatformPaymentConfigRecord> => existingConfig);
const findWechatPayConfigByProfile = mock(
  async (profileCode: string): Promise<PlatformPaymentConfigRecord | null> => {
    if (profileCode === "platform_direct_recharge") return existingConfig;
    if (profileCode === "tenant_service_provider") return serviceProviderConfig;
    return null;
  },
);
const upsertWechatPayConfig = mock(
  async (
    input: PlatformPaymentConfigUpsertInput,
  ): Promise<PlatformPaymentConfigRecord> => ({
  ...existingConfig,
  ...input,
  id: "platform-config-1",
  created_at: existingConfig.created_at,
  updated_at: "2026-07-02T09:00:00.000Z",
}));
const updateSetting = mock(async () => ({
  key: "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
}));
const hasPendingWechatOrdersForPaymentConfig = mock(async () => false);

const platformRole = {
  id: "role-platform",
  code: "platform_admin",
  name: "平台超管",
  description: null,
  status: "active",
} satisfies AuthContext["roles"][number];

const platformAuthBase = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [platformRole],
} satisfies Omit<AuthContext, "permissions">;

const tenantAuth = {
  ...platformAuthBase,
  authUserId: "auth-tenant",
  employeeId: "employee-tenant",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "platform.payment.config.read", scope: "all" }],
} satisfies AuthContext;

function platformAuth(permissions: AuthContext["permissions"]): AuthContext {
  return {
    ...platformAuthBase,
    permissions,
  };
}

async function createService() {
  const { PlatformPaymentConfigService } = await import("./platform-payment-configs");
  return new PlatformPaymentConfigService({
    repository: {
      findWechatPayConfig,
      findWechatPayConfigByProfile,
      upsertWechatPayConfig,
    },
    settingsService: {
      updateSetting,
    },
    pendingRechargeOrders: {
      hasPendingWechatOrdersForPaymentConfig,
    },
  });
}

describe("PlatformPaymentConfigService", () => {
  beforeEach(() => {
    findWechatPayConfig.mockClear();
    findWechatPayConfigByProfile.mockClear();
    upsertWechatPayConfig.mockClear();
    updateSetting.mockClear();
    hasPendingWechatOrdersForPaymentConfig.mockClear();
    findWechatPayConfig.mockImplementation(async () => existingConfig);
    findWechatPayConfigByProfile.mockImplementation(async (profileCode) => {
      if (profileCode === "platform_direct_recharge") return existingConfig;
      if (profileCode === "tenant_service_provider") return serviceProviderConfig;
      return null;
    });
    hasPendingWechatOrdersForPaymentConfig.mockImplementation(async () => false);
  });

  test("rejects non-platform admins", async () => {
    const service = await createService();

    await expect(service.getWechatPayConfig(tenantAuth)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  test("returns masked platform wechat pay config for readers", async () => {
    const service = await createService();

    const result = await service.getWechatPayConfig(
      platformAuth([{ code: "platform.payment.config.read", scope: "all" }]),
    );

    expect(findWechatPayConfig).toHaveBeenCalled();
    expect(result.configured).toBe(true);
    expect(result.can_manage).toBe(false);
    expect(result.config).toMatchObject({
      provider: "wechat_pay",
      principal_type: "platform",
      merchant_mode: "direct_merchant",
      merchant_name: "好店平台微信商户",
      merchant_id: "1900000001",
      app_id: "wx-platform-app",
      enabled_channels: ["tenant_recharge"],
      status: "active",
      validation_status: "valid",
      serial_no_masked: "12345678****cdef",
      has_encrypted_config_ref: true,
    });
    expect(result.config).not.toHaveProperty("serial_no");
    expect(result.config).not.toHaveProperty("recharge_guard_version");
  });

  test("rejects save without manage permission", async () => {
    const service = await createService();

    await expect(
      service.saveWechatPayConfig(
        platformAuth([{ code: "platform.payment.config.read", scope: "all" }]),
        {
          merchant_mode: "direct_merchant",
          merchant_id: "1900000001",
          app_id: "wx-platform-app",
          status: "pending",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("saves platform wechat pay config with audit fields", async () => {
    const service = await createService();

    await service.saveWechatPayConfig(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      {
        merchant_mode: "direct_merchant",
        merchant_name: "平台商户",
        merchant_id: "1900000002",
        app_id: "wx-platform-app-2",
        encrypted_config_ref: "secret://platform/wechat-pay-v2",
        serial_no: "abcdef1234567890",
        notify_url: "https://api.example.com/pay/wechat/callback",
        status: "active",
      },
    );

    expect(upsertWechatPayConfig).toHaveBeenCalledWith({
      provider: "wechat_pay",
      profile_code: "platform_direct_recharge",
      principal_type: "platform",
      merchant_mode: "direct_merchant",
      merchant_name: "平台商户",
      merchant_id: "1900000002",
      sub_merchant_id: null,
      app_id: "wx-platform-app-2",
      sub_app_id: null,
      encrypted_config_ref: "secret://platform/wechat-pay-v2",
      serial_no: "abcdef1234567890",
      notify_url: "https://api.example.com/pay/wechat/callback",
      enabled_channels: ["tenant_recharge"],
      status: "active",
      validation_status: "unchecked",
      last_validated_at: null,
      last_validation_error_code: null,
      last_validation_error_message: null,
      last_validation_request_id: null,
      risk_switches: {},
      created_by_employee_id: "employee-old",
      updated_by_employee_id: "employee-platform",
    });
  });

  test("blocks legacy direct-config critical rotation while a matching order is pending", async () => {
    hasPendingWechatOrdersForPaymentConfig.mockImplementationOnce(
      async () => true,
    );
    const service = await createService();

    await expect(service.saveWechatPayConfig(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      { merchant_id: "1900000002" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    });

    expect(hasPendingWechatOrdersForPaymentConfig).toHaveBeenCalledWith(
      existingConfig.id,
    );
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("lists direct recharge and tenant service provider payment profiles", async () => {
    const service = await createService();

    const result = await service.listWechatPayProfiles(
      platformAuth([{ code: "platform.payment.config.read", scope: "all" }]),
    );

    expect(result.can_manage).toBe(false);
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles.map((profile) => profile.profile_code)).toEqual([
      "platform_direct_recharge",
      "tenant_service_provider",
    ]);
    expect(result.profiles[0]).toMatchObject({
      profile_code: "platform_direct_recharge",
      label: "平台直连商户",
      secret_setting_key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
      configured: true,
      config: {
        merchant_mode: "direct_merchant",
        serial_no_masked: "12345678****cdef",
        has_encrypted_config_ref: true,
      },
    });
    const serviceProviderProfile = result.profiles[1];
    expect(serviceProviderProfile).toBeDefined();
    expect(serviceProviderProfile).toMatchObject({
      profile_code: "tenant_service_provider",
      label: "服务商商户",
      secret_setting_key: "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
      configured: true,
      config: {
        merchant_mode: "service_provider_sub_merchant",
        merchant_id: "190000SP01",
        app_id: "wx-service-provider-app",
        enabled_channels: ["project_payment", "applyment"],
      },
    });
    expect(serviceProviderProfile?.config).not.toHaveProperty("serial_no");
  });

  test("saves tenant service provider profile without overwriting direct merchant profile", async () => {
    findWechatPayConfigByProfile.mockImplementation(async (profileCode) =>
      profileCode === "tenant_service_provider" ? null : existingConfig
    );
    const service = await createService();

    await service.saveWechatPayProfile(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      "tenant_service_provider",
      {
        merchant_mode: "service_provider_sub_merchant",
        merchant_name: "好店大数据服务商",
        merchant_id: "190000SP01",
        app_id: "wx-service-provider-app",
        serial_no: "SERVICEPROVIDERSERIALNO",
        notify_url: "https://api.example.com/pay/wechat/callback",
        enabled_channels: ["project_payment", "applyment"],
        status: "active",
      },
    );

    expect(upsertWechatPayConfig).toHaveBeenCalledWith({
      provider: "wechat_pay",
      profile_code: "tenant_service_provider",
      principal_type: "platform",
      merchant_mode: "service_provider_sub_merchant",
      merchant_name: "好店大数据服务商",
      merchant_id: "190000SP01",
      sub_merchant_id: null,
      app_id: "wx-service-provider-app",
      sub_app_id: null,
      encrypted_config_ref:
        "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
      serial_no: "SERVICEPROVIDERSERIALNO",
      notify_url: "https://api.example.com/pay/wechat/callback",
      enabled_channels: ["project_payment", "applyment"],
      status: "active",
      validation_status: "unchecked",
      last_validated_at: null,
      last_validation_error_code: null,
      last_validation_error_message: null,
      last_validation_request_id: null,
      risk_switches: {},
      created_by_employee_id: "employee-platform",
      updated_by_employee_id: "employee-platform",
    });
  });

  test("stores service provider secret bundle in system settings and returns only safe metadata", async () => {
    const service = await createService();

    const result = await service.saveWechatPaySecretBundle(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      "tenant_service_provider",
      {
        private_key_pem: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
        api_v3_key: "12345678901234567890123456789012",
        wechat_pay_public_key_id: "PUB_KEY_ID_TEST",
        wechat_pay_public_key_pem: "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----",
      },
    );

    expect(updateSetting).toHaveBeenCalledTimes(1);
    const updateSettingCall = updateSetting.mock.calls[0];
    expect(updateSettingCall).toBeDefined();
    const [authContext, key, rawValue] = updateSettingCall as unknown as [
      AuthContext,
      string,
      string,
    ];
    expect(authContext.employeeId).toBe("employee-platform");
    expect(key).toBe("PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE");
    expect(JSON.parse(rawValue as string)).toEqual({
      private_key_pem: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      api_v3_key: "12345678901234567890123456789012",
      wechat_pay_public_key_id: "PUB_KEY_ID_TEST",
      wechat_pay_public_key_pem: "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----",
      base_url: "https://api.mch.weixin.qq.com",
    });
    expect(result.profile_code).toBe("tenant_service_provider");
    expect(result.config?.has_encrypted_config_ref).toBe(true);
    expect(upsertWechatPayConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_status: "unchecked",
        last_validated_at: null,
        last_validation_error_code: null,
        last_validation_error_message: null,
        last_validation_request_id: null,
      }),
    );
    expect(JSON.stringify(result)).not.toContain("12345678901234567890123456789012");
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
  });

  test("blocks referenced secret rotation before writing the setting", async () => {
    hasPendingWechatOrdersForPaymentConfig.mockImplementationOnce(
      async () => true,
    );
    const service = await createService();

    await expect(service.saveWechatPaySecretBundle(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      "platform_direct_recharge",
      {
        private_key_pem: "-----BEGIN PRIVATE KEY-----\\nnew\\n-----END PRIVATE KEY-----",
        api_v3_key: "12345678901234567890123456789012",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    });

    expect(hasPendingWechatOrdersForPaymentConfig).toHaveBeenCalledWith(
      existingConfig.id,
    );
    expect(updateSetting).not.toHaveBeenCalled();
    expect(upsertWechatPayConfig).not.toHaveBeenCalled();
  });

  test("allows an unrelated service-provider secret update without pending recharge orders", async () => {
    const service = await createService();

    await service.saveWechatPaySecretBundle(
      platformAuth([{ code: "platform.payment.config.manage", scope: "all" }]),
      "tenant_service_provider",
      {
        private_key_pem: "-----BEGIN PRIVATE KEY-----\\nnew\\n-----END PRIVATE KEY-----",
        api_v3_key: "12345678901234567890123456789012",
      },
    );

    expect(hasPendingWechatOrdersForPaymentConfig).toHaveBeenCalledWith(
      serviceProviderConfig.id,
    );
    expect(updateSetting).toHaveBeenCalledTimes(1);
    expect(upsertWechatPayConfig).toHaveBeenCalledTimes(1);
  });
});
