import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const KEY = "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN";
const VIRTUAL_KEY = "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE";
const UPDATED_AT = "2026-08-01T10:00:00.000Z";
const previousEncryptionKey = process.env.APP_CONFIG_ENCRYPTION_KEY;

type ServiceConstructor = typeof import(
  "@/services/system-settings/legacy-service"
)["SystemSettingsService"];
let SystemSettingsService: ServiceConstructor;
let encryptSecretValue: typeof import(
  "@/services/system-settings/legacy/crypto"
)["encryptSecretValue"];
let Errors: typeof import("@/errors/error-factory")["Errors"];

const platformAuth = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
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

beforeAll(async () => {
  process.env.APP_CONFIG_ENCRYPTION_KEY = "idempotency-test-key";
  ({ SystemSettingsService } = await import(
    "@/services/system-settings/legacy-service"
  ));
  ({ encryptSecretValue } = await import(
    "@/services/system-settings/legacy/crypto"
  ));
  ({ Errors } = await import("@/errors/error-factory"));
});

afterAll(() => {
  if (previousEncryptionKey === undefined) {
    delete process.env.APP_CONFIG_ENCRYPTION_KEY;
  } else {
    process.env.APP_CONFIG_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

function repository(input: {
  storedPlaintext: string;
  upsert: ReturnType<typeof mock>;
  key?: string;
  status?: "active" | "inactive";
}) {
  const key = input.key ?? KEY;
  return {
    findPlatformSecretByKey: mock(async () => ({
      key,
      value_text: encryptSecretValue(input.storedPlaintext),
      is_secret: true,
      status: input.status ?? "active" as const,
      updated_at: UPDATED_AT,
    })),
    findPlatformByKeys: mock(async () => []),
    findByKey: mock(async () => null),
    updateValue: mock(async () => { throw new TypeError("not used"); }),
    createValue: mock(async () => { throw new TypeError("not used"); }),
    upsertPlatformPaymentSecret: input.upsert,
  };
}

function persistedSetting(input: {
  key: string;
  valueType: "string" | "json";
  valueText: string;
}) {
  return {
    id: "setting-1",
    tenant_id: null,
    key: input.key,
    group_code: "payment",
    name: "支付密钥",
    description: "支付密钥",
    value_type: input.valueType,
    value_text: input.valueText,
    is_secret: true,
    status: "active" as const,
    updated_by_employee_id: "employee-1",
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
  };
}

describe("SystemSettingsService payment-secret idempotency", () => {
  test("writes once and makes a sequential retry a no-op", async () => {
    let snapshot: {
      key: string;
      value_text: string;
      is_secret: true;
      status: "active";
      updated_at: string;
    } | null = null;
    const upsert = mock(async (input: { valueText: string }) => {
      snapshot = {
        key: KEY,
        value_text: input.valueText,
        is_secret: true,
        status: "active",
        updated_at: UPDATED_AT,
      };
      return {
        id: "setting-1",
        tenant_id: null,
        ...snapshot,
        group_code: "payment",
        name: "微信虚拟支付消息令牌",
        description: "消息令牌",
        value_type: "string" as const,
        updated_by_employee_id: "employee-1",
        created_at: UPDATED_AT,
      };
    });
    const service = new SystemSettingsService({
      findPlatformSecretByKey: mock(async () => snapshot),
      findPlatformByKeys: mock(async () => []),
      findByKey: mock(async () => null),
      updateValue: mock(async () => { throw new TypeError("not used"); }),
      createValue: mock(async () => { throw new TypeError("not used"); }),
      upsertPlatformPaymentSecret: upsert,
    });

    await service.updatePlatformPaymentSecretSetting(
      platformAuth,
      KEY,
      "retry-message-token",
    );
    await service.updatePlatformPaymentSecretSetting(
      platformAuth,
      KEY,
      "retry-message-token",
    );

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  test("returns a masked no-op for the same decrypted value", async () => {
    const upsert = mock(async () => {
      throw new TypeError("atomic RPC must not run");
    });
    const service = new SystemSettingsService(repository({
      storedPlaintext: "same-message-token",
      upsert,
    }));

    const result = await service.updatePlatformPaymentSecretSetting(
      platformAuth,
      KEY,
      "same-message-token",
    );

    expect(upsert).not.toHaveBeenCalled();
    expect(result.value_text).toBe("******");
    expect(JSON.stringify(result)).not.toContain("same-message-token");
  });

  test("passes the stale expected token and preserves its stable conflict", async () => {
    const conflict = Errors.business(
      409,
      "支付密钥配置已变化，请刷新后重试",
      "SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT",
    );
    const upsert = mock(async () => { throw conflict; });
    const service = new SystemSettingsService(repository({
      storedPlaintext: "old-message-token",
      upsert,
    }));

    await expect(service.updatePlatformPaymentSecretSetting(
      platformAuth,
      KEY,
      "new-message-token",
    )).rejects.toBe(conflict);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: UPDATED_AT,
    }));
  });

  test("treats the same virtual AppKey revision as a no-op", async () => {
    const value = JSON.stringify({ appKey: "current-app-key", revision: 3 });
    const upsert = mock(async () => {
      throw new TypeError("atomic RPC must not run");
    });
    const service = new SystemSettingsService(repository({
      key: VIRTUAL_KEY,
      storedPlaintext: value,
      upsert,
    }));

    await expect(service.updatePlatformPaymentSecretSetting(
      platformAuth,
      VIRTUAL_KEY,
      value,
    )).resolves.toMatchObject({ key: VIRTUAL_KEY, value_text: "******" });
    expect(upsert).not.toHaveBeenCalled();
  });

  test.each([
    [JSON.stringify({ appKey: "current-app-key", revision: 2 })],
    [JSON.stringify({ appKey: "different-app-key", revision: 3 })],
  ])("rejects virtual AppKey revision rollback or reuse", async (value) => {
    const upsert = mock(async () => {
      throw new TypeError("atomic RPC must not run");
    });
    const service = new SystemSettingsService(repository({
      key: VIRTUAL_KEY,
      storedPlaintext: JSON.stringify({
        appKey: "current-app-key",
        revision: 3,
      }),
      upsert,
    }));

    await expect(service.updatePlatformPaymentSecretSetting(
      platformAuth,
      VIRTUAL_KEY,
      value,
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  test("rejects rollback against an inactive virtual secret revision", async () => {
    const upsert = mock(async () => {
      throw new TypeError("atomic RPC must not run");
    });
    const service = new SystemSettingsService(repository({
      key: VIRTUAL_KEY,
      status: "inactive",
      storedPlaintext: JSON.stringify({
        appKey: "inactive-app-key",
        revision: 4,
      }),
      upsert,
    }));

    await expect(service.updatePlatformPaymentSecretSetting(
      platformAuth,
      VIRTUAL_KEY,
      JSON.stringify({ appKey: "replacement-app-key", revision: 4 }),
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  test.each([
    {
      key: KEY,
      valueType: "string" as const,
      value: "inactive-message-token",
    },
    {
      key: VIRTUAL_KEY,
      valueType: "json" as const,
      value: JSON.stringify({ appKey: "inactive-app-key", revision: 4 }),
    },
  ])("reactivates the same inactive payment secret for $key", async ({
    key,
    valueType,
    value,
  }) => {
    const upsert = mock(async (input: { valueText: string }) =>
      persistedSetting({ key, valueType, valueText: input.valueText }));
    const service = new SystemSettingsService(repository({
      key,
      status: "inactive",
      storedPlaintext: value,
      upsert,
    }));

    const result = await service.updatePlatformPaymentSecretSetting(
      platformAuth,
      key,
      value,
    );

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: UPDATED_AT,
      status: "active",
    }));
    expect(result).toMatchObject({ status: "active", value_text: "******" });
  });
});
