import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { SystemSettingRecord } from "@/repositories/system-settings";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.APP_CONFIG_ENCRYPTION_KEY = "test-config-encryption-key";

type QueryResult = { data: unknown; error: unknown };

const existingSetting = {
  id: "setting-1",
  tenant_id: null,
  key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  group_code: "payment",
  name: "平台微信支付密钥包",
  description: null,
  value_type: "json",
  value_text: "encrypted-old-value",
  is_secret: true,
  status: "active",
  updated_by_employee_id: "employee-old",
  created_at: "2026-07-18T00:00:00.000Z",
  updated_at: "2026-07-18T00:00:00.000Z",
} satisfies SystemSettingRecord;

let maybeSingleResults: QueryResult[] = [];
let updateResult: QueryResult = { data: null, error: null };
const maybeSingle = mock(async () =>
  maybeSingleResults.shift() ?? { data: null, error: null }
);
const single = mock(async () => updateResult);
const insert = mock(async () => ({ error: null as unknown }));
const query = {
  select: mock(() => query),
  update: mock(() => query),
  eq: mock(() => query),
  is: mock(() => query),
  order: mock(() => query),
  maybeSingle,
  single,
  insert,
};
const from = mock((_table: string) => query);

const pendingConfigError = {
  code: "23514",
  message: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
};

function queueExistingSettings(count: number) {
  maybeSingleResults = Array.from({ length: count }, () => ({
    data: existingSetting,
    error: null,
  }));
}

const updateInput = {
  key: existingSetting.key,
  tenantId: null,
  valueText: "encrypted-new-value",
  employeeId: "employee-platform",
};

const platformAuth = {
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
  permissions: [],
} satisfies AuthContext;

async function createRepository() {
  const { SystemSettingRepository } = await import("./system-settings");
  return new SystemSettingRepository({ from });
}

describe("SystemSettingRepository payment config trigger errors", () => {
  beforeEach(() => {
    maybeSingle.mockClear();
    single.mockClear();
    insert.mockClear();
    from.mockClear();
    queueExistingSettings(1);
    updateResult = { data: null, error: null };
  });

  test("maps the exact pending recharge config trigger error to the stable 409", async () => {
    updateResult = { data: null, error: pendingConfigError };
    const systemSettingRepository = await createRepository();

    await expect(systemSettingRepository.updateValue(updateInput)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
        message:
          "存在使用当前微信支付配置的待支付充值订单，请等待订单支付或关闭后再修改",
      });
    expect(insert).not.toHaveBeenCalled();
  });

  test.each([
    [{ code: "23514", message: "UNRELATED_CHECK_VIOLATION" }],
    [{ code: "42P01", message: "relation does not exist" }],
  ])("keeps unrelated database errors as 500", async (error) => {
    updateResult = { data: null, error };
    const systemSettingRepository = await createRepository();

    await expect(systemSettingRepository.updateValue(updateInput)).rejects
      .toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: error,
      });
  });

  test("does not wrap an existing application error again", async () => {
    const existingError = Errors.business(409, "已有业务错误", "EXISTING_ERROR");
    updateResult = { data: null, error: existingError };
    const systemSettingRepository = await createRepository();

    await expect(systemSettingRepository.updateValue(updateInput)).rejects
      .toBe(existingError);
  });
});

describe("platform system settings payment secret update", () => {
  test("propagates the pending recharge conflict from the repository", async () => {
    queueExistingSettings(3);
    updateResult = { data: null, error: pendingConfigError };
    const { SystemSettingsService } = await import(
      "@/services/system-settings/legacy-service"
    );
    const systemSettingsService = new SystemSettingsService(
      await createRepository(),
    );

    await expect(systemSettingsService.updateSetting(
      platformAuth,
      existingSetting.key,
      JSON.stringify({
        private_key_pem: "private-key",
        api_v3_key: "api-v3-key",
      }),
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    });
  });
});
