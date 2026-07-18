import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentConfigUpsertInput,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import { UpdatePlatformWechatPayConfigSchema } from "@/schema/platform-payment-configs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const directConfig = {
  id: "direct-config",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-direct-app",
  sub_app_id: null,
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "DIRECT-SERIAL",
  notify_url: "https://api.example.com/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: "employee-old",
  updated_by_employee_id: "employee-old",
  created_at: "2026-07-18T00:00:00.000Z",
  updated_at: "2026-07-18T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const providerConfig = {
  ...directConfig,
  id: "provider-config",
  profile_code: "tenant_service_provider",
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: "190000SP01",
  sub_merchant_id: "1900000101",
  app_id: "wx-provider-app",
  sub_app_id: "wx-sub-app",
  encrypted_config_ref:
    "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  serial_no: "PROVIDER-SERIAL",
  enabled_channels: ["project_payment", "applyment"],
} satisfies PlatformPaymentConfigRecord;

const findWechatPayConfig = mock(async () => directConfig);
const findWechatPayConfigByProfile = mock(
  async (profileCode: PlatformPaymentProfileCode) =>
    profileCode === "platform_direct_recharge" ? directConfig : providerConfig,
);
const upsertWechatPayConfig = mock(async (input: PlatformPaymentConfigUpsertInput) => ({
  ...directConfig,
  ...input,
}));
const updateSetting = mock(async () => ({ key: "setting-key" }));
const hasPendingWechatOrdersForPaymentConfig = mock(async () => false);

const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
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
  permissions: [{ code: "platform.payment.config.manage", scope: "all" }],
} satisfies AuthContext;

async function createService() {
  const { PlatformPaymentConfigService } = await import(
    "./platform-payment-configs"
  );
  return new PlatformPaymentConfigService({
    repository: {
      findWechatPayConfig,
      findWechatPayConfigByProfile,
      upsertWechatPayConfig,
    },
    settingsService: { updateSetting },
    pendingRechargeOrders: { hasPendingWechatOrdersForPaymentConfig },
  });
}

describe("PlatformPaymentConfigService pending recharge guards", () => {
  beforeEach(() => {
    findWechatPayConfig.mockClear();
    findWechatPayConfigByProfile.mockClear();
    upsertWechatPayConfig.mockClear();
    updateSetting.mockClear();
    hasPendingWechatOrdersForPaymentConfig.mockClear();
    findWechatPayConfig.mockImplementation(async () => directConfig);
    findWechatPayConfigByProfile.mockImplementation(async (profileCode) =>
      profileCode === "platform_direct_recharge" ? directConfig : providerConfig
    );
    hasPendingWechatOrdersForPaymentConfig.mockImplementation(async () => false);
  });

  test.each([
    ["merchant mode", "platform_direct_recharge", {
      merchant_mode: "service_provider_sub_merchant",
    }],
    ["merchant id", "platform_direct_recharge", { merchant_id: "1900000002" }],
    ["app id", "platform_direct_recharge", { app_id: "wx-direct-app-v2" }],
    ["serial number", "platform_direct_recharge", { serial_no: "DIRECT-SERIAL-V2" }],
    ["encrypted ref", "platform_direct_recharge", {
      encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE_V2",
    }],
    ["sub merchant id", "tenant_service_provider", {
      sub_merchant_id: "1900000102",
    }],
    ["sub app id", "tenant_service_provider", { sub_app_id: "wx-sub-app-v2" }],
  ] as const)(
    "blocks %s rotation while a matching order is pending",
    async (_label, profileCode, input) => {
      hasPendingWechatOrdersForPaymentConfig.mockImplementationOnce(
        async () => true,
      );
      const service = await createService();

      await expect(service.saveWechatPayProfile(
        authContext,
        profileCode,
        input,
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
      });

      const configId = profileCode === "platform_direct_recharge"
        ? directConfig.id
        : providerConfig.id;
      expect(hasPendingWechatOrdersForPaymentConfig).toHaveBeenCalledWith(
        configId,
      );
      expect(upsertWechatPayConfig).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["status", { status: "disabled" as const }],
    ["enabled channels", {
      enabled_channels: ["tenant_recharge", "project_payment"] as const,
    }],
  ])(
    "allows a %s-only update and preserves critical fields",
    async (_label, input) => {
      hasPendingWechatOrdersForPaymentConfig.mockImplementation(
        async () => true,
      );
      const service = await createService();
      const parsedInput = UpdatePlatformWechatPayConfigSchema.parse(input);

      await service.saveWechatPayProfile(
        authContext,
        "platform_direct_recharge",
        parsedInput,
      );

      expect(hasPendingWechatOrdersForPaymentConfig).not.toHaveBeenCalled();
      expect(upsertWechatPayConfig).toHaveBeenCalledWith(expect.objectContaining({
        merchant_mode: directConfig.merchant_mode,
        merchant_id: directConfig.merchant_id,
        sub_merchant_id: directConfig.sub_merchant_id,
        app_id: directConfig.app_id,
        sub_app_id: directConfig.sub_app_id,
        serial_no: directConfig.serial_no,
        encrypted_config_ref: directConfig.encrypted_config_ref,
      }));
    },
  );

  test("allows an unchanged critical value while pending orders exist", async () => {
    hasPendingWechatOrdersForPaymentConfig.mockImplementation(async () => true);
    const service = await createService();

    await service.saveWechatPayProfile(authContext, "platform_direct_recharge", {
      merchant_id: directConfig.merchant_id,
    });

    expect(hasPendingWechatOrdersForPaymentConfig).not.toHaveBeenCalled();
    expect(upsertWechatPayConfig).toHaveBeenCalledTimes(1);
  });

  test("keeps direct-merchant sub-merchant fields null", async () => {
    const service = await createService();

    await service.saveWechatPayProfile(authContext, "platform_direct_recharge", {
      sub_merchant_id: "must-not-be-written",
      sub_app_id: "must-not-be-written",
    });

    expect(upsertWechatPayConfig).toHaveBeenCalledWith(expect.objectContaining({
      sub_merchant_id: null,
      sub_app_id: null,
    }));
  });

  test("allows critical rotation when no matching order is pending", async () => {
    const service = await createService();

    await service.saveWechatPayProfile(authContext, "platform_direct_recharge", {
      merchant_id: "1900000002",
    });

    expect(hasPendingWechatOrdersForPaymentConfig).toHaveBeenCalledWith(
      directConfig.id,
    );
    expect(upsertWechatPayConfig).toHaveBeenCalledWith(expect.objectContaining({
      merchant_id: "1900000002",
      app_id: directConfig.app_id,
    }));
  });
});
