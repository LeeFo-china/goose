import { describe, expect, mock, test } from "bun:test";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentConfigUpsertInput,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const REVISION = "11111111-1111-4111-8111-111111111111";
const config = {
  id: "platform-config-2",
  provider: "wechat_pay",
  profile_code: "tenant_service_provider",
  principal_type: "platform",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "平台服务商",
  merchant_id: "190000SP01",
  sub_merchant_id: null,
  app_id: "wx-service-provider-app",
  sub_app_id: null,
  encrypted_config_ref:
    "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  secret_bundle_revision: "old-revision",
  serial_no: "SERVICEPROVIDERSERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["project_payment", "applyment"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-20T15:00:00.000Z",
  risk_switches: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-20T14:00:00.000Z",
  updated_at: "2026-07-20T15:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

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

describe("PlatformPaymentConfigService secret bundle revision", () => {
  test("updates the profile first and remains unchecked when secret storage fails", async () => {
    const callOrder: string[] = [];
    const upsertWechatPayConfig = mock(
      async (input: PlatformPaymentConfigUpsertInput) => {
        callOrder.push("profile-unchecked");
        return { ...config, ...input } satisfies PlatformPaymentConfigRecord;
      },
    );
    const updatePlatformPaymentSecretSetting = mock(async () => {
      callOrder.push("secret-write");
      return Promise.reject({ statusCode: 500, code: "DB_ERROR" });
    });
    const { PlatformPaymentConfigService } = await import(
      "./platform-payment-configs"
    );
    const service = new PlatformPaymentConfigService({
      repository: {
        findWechatPayConfig: mock(async () => config),
        findWechatPayConfigByProfile: mock(async () => config),
        upsertWechatPayConfig,
      },
      settingsService: { updatePlatformPaymentSecretSetting },
      pendingRechargeOrders: {
        hasPendingWechatOrdersForPaymentConfig: mock(async () => false),
      },
      secretBundleRevisionFactory: () => REVISION,
    });

    await expect(service.saveWechatPaySecretBundle(
      authContext,
      "tenant_service_provider",
      {
        private_key_pem: "-----BEGIN PRIVATE KEY-----\\nnew\\n-----END PRIVATE KEY-----",
        api_v3_key: "12345678901234567890123456789012",
      },
    )).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    expect(callOrder).toEqual(["profile-unchecked", "secret-write"]);
    expect(upsertWechatPayConfig).toHaveBeenCalledWith(expect.objectContaining({
      secret_bundle_revision: REVISION,
      validation_status: "unchecked",
      last_validated_at: null,
    }));
    expect(upsertWechatPayConfig).toHaveBeenCalledTimes(1);
  });
});
