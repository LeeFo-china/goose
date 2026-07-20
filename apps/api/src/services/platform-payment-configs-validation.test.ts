import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "MERCHANT_CERT_SERIAL",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-20T15:10:00.000Z",
  last_validation_error_code: null,
  last_validation_error_message: null,
  last_validation_request_id: "wechat-request-id",
  risk_switches: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-20T14:00:00.000Z",
  updated_at: "2026-07-20T15:10:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const findWechatPayConfig = mock(async () => config);
const findWechatPayConfigByProfile = mock(async () => config);
const upsertWechatPayConfig = mock(async () => config);
const validate = mock(async () => ({
  config,
  validation: {
    ok: true as const,
    probe_mode: "wechat_pay_public_key" as const,
    api_v3_key_probe: "format_only" as const,
    request_id: "wechat-request-id",
    validated_at: "2026-07-20T15:10:00.000Z",
  },
}));

const authBase = {
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
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function auth(permissions: AuthContext["permissions"]): AuthContext {
  return { ...authBase, permissions };
}

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
    settingsService: { updateSetting: mock(async () => ({})) },
    pendingRechargeOrders: {
      hasPendingWechatOrdersForPaymentConfig: mock(async () => false),
    },
    profileValidationService: { validate },
  });
}

describe("PlatformPaymentConfigService profile validation", () => {
  beforeEach(() => {
    validate.mockClear();
  });

  test("requires platform payment manage permission", async () => {
    const service = await createService();

    await expect(service.validateWechatPayProfile(
      auth([{ code: "platform.payment.config.read", scope: "all" }]),
      "platform_direct_recharge",
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(validate).not.toHaveBeenCalled();
  });

  test("delegates validation and returns only the safe profile view", async () => {
    const service = await createService();

    const result = await service.validateWechatPayProfile(
      auth([{ code: "platform.payment.config.manage", scope: "all" }]),
      "platform_direct_recharge",
    );

    expect(validate).toHaveBeenCalledWith({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    });
    expect(result).toMatchObject({
      profile: {
        profile_code: "platform_direct_recharge",
        config: {
          validation_status: "valid",
          serial_no_masked: "MERCHANT****RIAL",
          has_encrypted_config_ref: true,
        },
      },
      validation: {
        ok: true,
        probe_mode: "wechat_pay_public_key",
        api_v3_key_probe: "format_only",
      },
    });
    expect(JSON.stringify(result)).not.toContain("MERCHANT_CERT_SERIAL");
  });
});
