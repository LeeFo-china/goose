import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const KEY = "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE";
const UPDATED_AT = "2026-08-01T10:00:00.000Z";
const ENCRYPTED_VALUE =
  `enc:v1:${"A".repeat(16)}:${"B".repeat(22)}:QUJD`;

const savedRecord = {
  id: "setting-1",
  tenant_id: null,
  key: KEY,
  group_code: "payment",
  name: "微信虚拟支付生产密钥包",
  description: "生产密钥",
  value_type: "json",
  value_text: ENCRYPTED_VALUE,
  is_secret: true,
  status: "active",
  updated_by_employee_id: "employee-1",
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: UPDATED_AT,
};

type RepositoryConstructor = typeof import(
  "./system-settings"
)["SystemSettingRepository"];
let SystemSettingRepository: RepositoryConstructor;

beforeAll(async () => {
  ({ SystemSettingRepository } = await import("./system-settings"));
});

function input() {
  return {
    key: KEY,
    groupCode: "payment",
    name: savedRecord.name,
    description: savedRecord.description,
    valueType: "json" as const,
    valueText: ENCRYPTED_VALUE,
    status: "active" as const,
    employeeId: "employee-1",
    expectedUpdatedAt: UPDATED_AT,
  };
}

describe("SystemSettingRepository atomic payment-secret concurrency", () => {
  test("passes the exact expected timestamp to the RPC", async () => {
    const rpc = mock(async () => ({ data: savedRecord, error: null }));
    const repository = new SystemSettingRepository({ rpc });

    await repository.upsertPlatformPaymentSecret(input());

    expect(rpc).toHaveBeenCalledWith(
      "upsert_platform_payment_secret_setting",
      expect.objectContaining({ p_expected_updated_at: UPDATED_AT }),
    );
  });

  test.each([
    null,
    [[savedRecord]],
    { ...savedRecord, key: "WRONG_KEY" },
    { ...savedRecord, tenant_id: "tenant-1" },
    { ...savedRecord, is_secret: false },
    { ...savedRecord, value_text: "enc:v1:invalid" },
    { ...savedRecord, group_code: "other" },
    { ...savedRecord, status: "inactive" },
    { ...savedRecord, value_type: "string" },
  ])("rejects unsafe RPC response shape %#", async (data) => {
    const repository = new SystemSettingRepository({
      rpc: mock(async () => ({ data, error: null })),
    });

    await expect(repository.upsertPlatformPaymentSecret(input())).rejects
      .toMatchObject({ code: "DB_ERROR", details: undefined });
  });

  test("maps the stable expected-version conflict", async () => {
    const repository = new SystemSettingRepository({
      rpc: mock(async () => ({
        data: null,
        error: {
          code: "P0001",
          message: "SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT",
        },
      })),
    });

    await expect(repository.upsertPlatformPaymentSecret(input())).rejects
      .toMatchObject({
        statusCode: 409,
        code: "SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT",
      });
  });
});
