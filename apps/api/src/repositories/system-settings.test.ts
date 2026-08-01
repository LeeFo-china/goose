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
const rpc = mock(async (
  _name: string,
  _params: Record<string, unknown>,
): Promise<QueryResult> => ({ data: existingSetting, error: null }));

const pendingConfigError = {
  code: "23514",
  message: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
};
const pendingVirtualOrderError = {
  code: "P0001",
  message: "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
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
  return new SystemSettingRepository({ from, rpc });
}

const atomicInput = {
  key: existingSetting.key,
  groupCode: existingSetting.group_code,
  name: existingSetting.name,
  description: existingSetting.description,
  valueType: existingSetting.value_type,
  valueText: "encrypted-new-value",
  status: existingSetting.status,
  employeeId: "employee-platform",
};

describe("SystemSettingRepository atomic payment secret write", () => {
  beforeEach(() => rpc.mockClear());

  test("calls only the atomic RPC with exact parameters", async () => {
    const repository = await createRepository();

    const result = await repository.upsertPlatformPaymentSecret(atomicInput);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "upsert_platform_payment_secret_setting",
      {
        p_setting_key: atomicInput.key,
        p_group_code: atomicInput.groupCode,
        p_name: atomicInput.name,
        p_description: atomicInput.description,
        p_value_type: atomicInput.valueType,
        p_value_text: atomicInput.valueText,
        p_status: atomicInput.status,
        p_changed_by_employee_id: atomicInput.employeeId,
      },
    );
    expect(result).toEqual(existingSetting);
    expect(insert).not.toHaveBeenCalled();
  });

  test("maps known trigger guards and sanitizes unknown diagnostics", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: pendingVirtualOrderError,
    }));
    const repository = await createRepository();

    await expect(repository.upsertPlatformPaymentSecret(atomicInput)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
      });

    const privateDiagnostics = {
      message: "private SQL encrypted-new-value",
      details: "ciphertext encrypted-old-value",
    };
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: privateDiagnostics,
    }));

    await expect(repository.upsertPlatformPaymentSecret(atomicInput)).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });

    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: Errors.business(500, "unsafe encrypted-new-value", "UNSAFE"),
    }));
    await expect(repository.upsertPlatformPaymentSecret(atomicInput)).rejects
      .toMatchObject({
        code: "DB_ERROR",
        message: "保存平台支付密钥配置失败",
        details: undefined,
      });
  });
});

describe("SystemSettingRepository secret change-log redaction", () => {
  test("redacts both old and new values when updating a secret", async () => {
    const logInsert = mock(async () => ({ error: null }));
    const settingQuery = {
      select: mock(() => settingQuery),
      update: mock(() => settingQuery),
      eq: mock(() => settingQuery),
      is: mock(() => settingQuery),
      maybeSingle: mock(async () => ({ data: existingSetting, error: null })),
      single: mock(async () => ({
        data: { ...existingSetting, value_text: "plain-new-secret" },
        error: null,
      })),
    };
    const repository = new (await import("./system-settings"))
      .SystemSettingRepository({
        from: (table: string) => table === "system_settings"
          ? settingQuery
          : { insert: logInsert },
      });

    await repository.updateValue({ ...updateInput, valueText: "plain-new-secret" });

    expect(logInsert).toHaveBeenCalledWith(expect.objectContaining({
      old_value_text: null,
      new_value_text: null,
    }));
    expect(JSON.stringify(logInsert.mock.calls)).not.toContain(
      existingSetting.value_text,
    );
    expect(JSON.stringify(logInsert.mock.calls)).not.toContain(
      "plain-new-secret",
    );
  });

  test("redacts created secrets but preserves non-secret log values", async () => {
    const secretLogInsert = mock(async () => ({ error: null }));
    const createRepositoryWithLog = async (
      record: SystemSettingRecord,
      logInsert: typeof secretLogInsert,
    ) => {
      const settingQuery = {
        insert: mock(() => settingQuery),
        select: mock(() => settingQuery),
        single: mock(async () => ({ data: record, error: null })),
      };
      return new (await import("./system-settings")).SystemSettingRepository({
        from: (table: string) => table === "system_settings"
          ? settingQuery
          : { insert: logInsert },
      });
    };
    const secretRepository = await createRepositoryWithLog(
      { ...existingSetting, value_text: "encrypted-created-secret" },
      secretLogInsert,
    );

    await secretRepository.createValue({
      key: existingSetting.key,
      tenantId: null,
      groupCode: existingSetting.group_code,
      name: existingSetting.name,
      description: existingSetting.description,
      valueType: existingSetting.value_type,
      valueText: "encrypted-created-secret",
      isSecret: true,
      status: existingSetting.status,
      employeeId: "employee-platform",
    });

    expect(secretLogInsert).toHaveBeenCalledWith(expect.objectContaining({
      old_value_text: null,
      new_value_text: null,
    }));
    expect(JSON.stringify(secretLogInsert.mock.calls)).not.toContain(
      "encrypted-created-secret",
    );

    const nonSecretLogInsert = mock(async () => ({ error: null }));
    const nonSecretRepository = await createRepositoryWithLog(
      { ...existingSetting, is_secret: false, value_text: "visible-value" },
      nonSecretLogInsert,
    );
    await nonSecretRepository.createValue({
      key: "VISIBLE_SETTING",
      tenantId: null,
      groupCode: "general",
      name: "Visible setting",
      description: null,
      valueType: "string",
      valueText: "visible-value",
      isSecret: false,
      status: "active",
      employeeId: "employee-platform",
    });
    expect(nonSecretLogInsert).toHaveBeenCalledWith(expect.objectContaining({
      old_value_text: null,
      new_value_text: "visible-value",
    }));
  });
});

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

  test("maps the exact virtual payment rotation guard to the stable 409", async () => {
    updateResult = { data: null, error: pendingVirtualOrderError };
    const systemSettingRepository = await createRepository();

    await expect(systemSettingRepository.updateValue(updateInput)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
        message: "存在待签发、签发中或待核对的虚拟支付订单，请完成处理后再变更密钥",
      });
    expect(insert).not.toHaveBeenCalled();
  });

  test.each([
    [
      "BRANDING_VIRTUAL_PAYMENT_SECRET_IDENTITY_IMMUTABLE",
      "虚拟支付密钥的标识、归属和密钥属性不可修改",
    ],
    [
      "BRANDING_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID",
      "虚拟支付密钥必须是平台级加密配置",
    ],
    [
      "WECHAT_VIRTUAL_MESSAGE_TOKEN_IDENTITY_IMMUTABLE",
      "虚拟支付消息令牌的标识、归属和密钥属性不可修改",
    ],
    [
      "WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID",
      "虚拟支付消息令牌必须是平台级加密配置",
    ],
  ])("maps exact virtual secret guard error %s", async (code, message) => {
    updateResult = { data: null, error: { code: "P0001", message: code } };
    const systemSettingRepository = await createRepository();

    await expect(systemSettingRepository.updateValue(updateInput)).rejects
      .toMatchObject({ statusCode: 409, code, message });
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
  beforeEach(() => {
    maybeSingle.mockClear();
    single.mockClear();
    insert.mockClear();
    rpc.mockClear();
    query.update.mockClear();
    from.mockClear();
    maybeSingleResults = [];
    updateResult = { data: null, error: null };
  });

  test.each([
    "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
    "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
  ])("blocks generic writes to protected payment secret %s", async (key) => {
    const { SystemSettingsService } = await import(
      "@/services/system-settings/legacy-service"
    );
    const systemSettingsService = new SystemSettingsService(
      await createRepository(),
    );

    await expect(systemSettingsService.updateSetting(
      platformAuth,
      key,
      "protected-value",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SYSTEM_SETTING_PAYMENT_SECRET_PROTECTED",
      message: "支付密钥只能通过支付配置专用接口更新",
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  test.each([
    [
      "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
      JSON.stringify({ private_key_pem: "direct-private-key" }),
    ],
    [
      "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
      JSON.stringify({ private_key_pem: "provider-private-key" }),
    ],
    [
      "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      JSON.stringify({ appKey: "sandbox-app-key", revision: 1 }),
    ],
    [
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
      JSON.stringify({ appKey: "production-app-key", revision: 2 }),
    ],
    ["WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN", "message-token"],
  ])("uses the atomic writer for protected payment secret %s", async (
    key,
    value,
  ) => {
    rpc.mockImplementationOnce(async () => ({
      data: { ...existingSetting, key },
      error: null,
    }));
    const { SystemSettingsService } = await import(
      "@/services/system-settings/legacy-service"
    );
    const systemSettingsService = new SystemSettingsService(
      await createRepository(),
    );

    const result = await systemSettingsService.updatePlatformPaymentSecretSetting(
      platformAuth,
      key,
      value,
    );

    expect(result.key).toBe(key);
    expect(result.value_text).toBe("******");
    expect(result.stored_value).toBe("******");
    expect(result.effective_value).toBe("******");
    expect(JSON.stringify(result)).not.toContain(value);
    expect(JSON.stringify(result)).not.toContain(existingSetting.value_text);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(query.update).not.toHaveBeenCalled();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  test("rejects non-payment keys through the dedicated internal writer", async () => {
    const { SystemSettingsService } = await import(
      "@/services/system-settings/legacy-service"
    );
    const systemSettingsService = new SystemSettingsService(
      await createRepository(),
    );

    await expect(systemSettingsService.updatePlatformPaymentSecretSetting(
      platformAuth,
      "SOME_OTHER_SECRET",
      "value",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SYSTEM_SETTING_PAYMENT_SECRET_KEY_INVALID",
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  test("propagates pending recharge conflicts from the dedicated writer", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: pendingConfigError,
    }));
    const { SystemSettingsService } = await import(
      "@/services/system-settings/legacy-service"
    );
    const systemSettingsService = new SystemSettingsService(
      await createRepository(),
    );

    await expect(systemSettingsService.updatePlatformPaymentSecretSetting(
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
