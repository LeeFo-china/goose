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
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "好店平台微信商户",
  merchant_id: "1900000001",
  app_id: "wx-platform-app",
  encrypted_config_ref: "secret://platform/wechat-pay",
  serial_no: "1234567890abcdef",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-02T08:00:00.000Z",
  risk_switches: {},
  created_by_employee_id: "employee-old",
  updated_by_employee_id: "employee-old",
  created_at: "2026-07-02T07:00:00.000Z",
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const findWechatPayConfig = mock(async (): Promise<PlatformPaymentConfigRecord> => existingConfig);
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
      upsertWechatPayConfig,
    },
  });
}

describe("PlatformPaymentConfigService", () => {
  beforeEach(() => {
    findWechatPayConfig.mockClear();
    upsertWechatPayConfig.mockClear();
    findWechatPayConfig.mockImplementation(async () => existingConfig);
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
      principal_type: "platform",
      merchant_mode: "direct_merchant",
      merchant_name: "平台商户",
      merchant_id: "1900000002",
      app_id: "wx-platform-app-2",
      encrypted_config_ref: "secret://platform/wechat-pay-v2",
      serial_no: "abcdef1234567890",
      notify_url: "https://api.example.com/pay/wechat/callback",
      enabled_channels: ["tenant_recharge"],
      status: "active",
      validation_status: "unchecked",
      last_validated_at: null,
      risk_switches: {},
      created_by_employee_id: "employee-old",
      updated_by_employee_id: "employee-platform",
    });
  });
});
