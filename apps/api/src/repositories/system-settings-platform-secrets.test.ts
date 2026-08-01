import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const KEYS = [
  "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
] as const;

type RepositoryConstructor = typeof import(
  "./system-settings"
)["SystemSettingRepository"];
type ServiceConstructor = typeof import(
  "@/services/system-settings/legacy-service"
)["SystemSettingsService"];
let SystemSettingRepository: RepositoryConstructor;
let SystemSettingsService: ServiceConstructor;

beforeAll(async () => {
  ({ SystemSettingRepository } = await import("./system-settings"));
  ({ SystemSettingsService } = await import(
    "@/services/system-settings/legacy-service"
  ));
});

describe("bounded platform secret settings query", () => {
  test("selects one exact platform secret without weakening the two-key query", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      select(columns: string) {
        calls.push(["select", columns]);
        return query;
      },
      eq(column: string, value: string) {
        calls.push(["eq", column, value]);
        return query;
      },
      is(column: string, value: null) {
        calls.push(["is", column, value]);
        return query;
      },
      limit(value: number) {
        calls.push(["limit", value]);
        return query;
      },
      maybeSingle: mock(async () => ({
        data: {
          key: KEYS[1],
          value_text: JSON.stringify({ appKey: "production", revision: 3 }),
          is_secret: true,
          status: "active",
        },
        error: null,
      })),
    };
    const repository = new SystemSettingRepository({
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    });

    const result = await repository.findPlatformSecretByKey(KEYS[1]);

    expect(result?.key).toBe(KEYS[1]);
    expect(calls).toContainEqual(["eq", "key", KEYS[1]]);
    expect(calls).toContainEqual(["is", "tenant_id", null]);
    expect(calls).toContainEqual(["limit", 1]);
    expect(calls).toContainEqual([
      "select",
      "key,value_text,is_secret,status",
    ]);
  });

  test("selects exactly two platform keys without a full-table scan", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      select(columns: string) {
        calls.push(["select", columns]);
        return query;
      },
      in(column: string, values: readonly string[]) {
        calls.push(["in", column, values]);
        return query;
      },
      is(column: string, value: null) {
        calls.push(["is", column, value]);
        return query;
      },
      limit: mock(async (count: number) => {
        calls.push(["limit", count]);
        return { data: [], error: null };
      }),
    };
    const repository = new SystemSettingRepository({
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    });

    await repository.findPlatformByKeys(KEYS);

    expect(calls).toContainEqual(["from", "system_settings"]);
    expect(calls).toContainEqual(["in", "key", KEYS]);
    expect(calls).toContainEqual(["is", "tenant_id", null]);
    expect(calls).toContainEqual(["limit", 2]);
    const columns = calls.find(([method]) => method === "select")?.[1];
    expect(columns).toBe("key,value_text,is_secret,status");
    expect(columns).not.toBe("*");
  });

  test("sanitizes batch query database diagnostics", async () => {
    const query = {
      select() {
        return query;
      },
      in() {
        return query;
      },
      is() {
        return query;
      },
      limit: mock(async () => ({
        data: null,
        error: { value_text: "must-not-leak", message: "private sql" },
      })),
    };
    const repository = new SystemSettingRepository({ from: () => query });

    await expect(repository.findPlatformByKeys(KEYS)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });

  test("resolves two values from one repository batch", async () => {
    const findPlatformByKeys = mock(async () => KEYS.map((key, index) => ({
      key,
      value_text: JSON.stringify({ appKey: `key-${index}`, revision: index + 1 }),
      is_secret: true,
      status: "active" as const,
    })));
    const service = new SystemSettingsService({
      findPlatformByKeys,
      findPlatformSecretByKey: mock(async () => null),
      findByKey: mock(async () => null),
      updateValue: mock(async () => {
        throw new TypeError("not used");
      }),
      createValue: mock(async () => {
        throw new TypeError("not used");
      }),
    });

    const result = await service.getPlatformSecretStrings(KEYS);

    expect(findPlatformByKeys).toHaveBeenCalledTimes(1);
    expect(result[KEYS[0]]).toContain('"revision":1');
    expect(result[KEYS[1]]).toContain('"revision":2');
  });

  test("resolves one exact secret without reading the other environment", async () => {
    const findPlatformSecretByKey = mock(async () => ({
      key: KEYS[1],
      value_text: JSON.stringify({ appKey: "production", revision: 3 }),
      is_secret: false,
      status: "active" as const,
    }));
    const service = new SystemSettingsService({
      findPlatformSecretByKey,
      findPlatformByKeys: mock(async () => {
        throw new TypeError("batch lookup must not run");
      }),
      findByKey: mock(async () => null),
      updateValue: mock(async () => {
        throw new TypeError("not used");
      }),
      createValue: mock(async () => {
        throw new TypeError("not used");
      }),
    });

    expect(await service.getPlatformSecretString(KEYS[1])).toContain(
      '"revision":3',
    );
    expect(findPlatformSecretByKey).toHaveBeenCalledWith(KEYS[1]);
  });

  test("reports database metadata without decrypting or leaking the stored value", async () => {
    const storedValue = "enc:v1:invalid-sensitive-ciphertext";
    const findPlatformSecretByKey = mock(async () => ({
      key: KEYS[0],
      value_text: storedValue,
      is_secret: true,
      status: "active" as const,
    }));
    const service = new SystemSettingsService({
      findPlatformSecretByKey,
      findPlatformByKeys: mock(async () => {
        throw new TypeError("batch lookup must not run");
      }),
      findByKey: mock(async () => {
        throw new TypeError("generic lookup must not run");
      }),
      updateValue: mock(async () => {
        throw new TypeError("not used");
      }),
      createValue: mock(async () => {
        throw new TypeError("not used");
      }),
    });

    const result = await service.getPlatformSettingStatus(KEYS[0]);

    expect(result).toEqual({ configured: true, source: "database" });
    expect(findPlatformSecretByKey).toHaveBeenCalledTimes(1);
    expect(findPlatformSecretByKey).toHaveBeenCalledWith(KEYS[0]);
    expect(JSON.stringify(result)).not.toContain(storedValue);
  });

  test("reports env and empty metadata after an exact inactive-or-missing lookup", async () => {
    const envKey = KEYS[1];
    const emptyKey = "WECHAT_MINIPROGRAM_ORIGINAL_ID";
    const previousEnv = process.env[envKey];
    const previousOriginalId = process.env[emptyKey];
    process.env[envKey] = "environment-secret";
    delete process.env[emptyKey];
    const findPlatformSecretByKey = mock(async (key: string) => key === envKey
      ? {
        key,
        value_text: "ignored-inactive-value",
        is_secret: true,
        status: "inactive" as const,
      }
      : null);
    const service = new SystemSettingsService({
      findPlatformSecretByKey,
      findPlatformByKeys: mock(async () => []),
      findByKey: mock(async () => null),
      updateValue: mock(async () => {
        throw new TypeError("not used");
      }),
      createValue: mock(async () => {
        throw new TypeError("not used");
      }),
    });

    try {
      await expect(service.getPlatformSettingStatus(envKey)).resolves.toEqual({
        configured: true,
        source: "env",
      });
      await expect(service.getPlatformSettingStatus(emptyKey)).resolves.toEqual({
        configured: false,
        source: "empty",
      });
      expect(findPlatformSecretByKey).toHaveBeenCalledTimes(2);
    } finally {
      if (previousEnv === undefined) delete process.env[envKey];
      else process.env[envKey] = previousEnv;
      if (previousOriginalId === undefined) delete process.env[emptyKey];
      else process.env[emptyKey] = previousOriginalId;
    }
  });

  test("preserves a sanitized decrypt failure instead of treating it as empty", async () => {
    const previousKey = process.env.APP_CONFIG_ENCRYPTION_KEY;
    delete process.env.APP_CONFIG_ENCRYPTION_KEY;
    const findPlatformByKeys = mock(async () => [{
      key: KEYS[0],
      value_text: "enc:v1:a:b:c",
      is_secret: true,
      status: "active" as const,
    }]);
    const service = new SystemSettingsService({
      findPlatformByKeys,
      findPlatformSecretByKey: mock(async () => null),
      findByKey: mock(async () => null),
      updateValue: mock(async () => {
        throw new TypeError("not used");
      }),
      createValue: mock(async () => {
        throw new TypeError("not used");
      }),
    });

    try {
      await expect(service.getPlatformSecretStrings(KEYS)).rejects
        .toMatchObject({
          statusCode: 500,
          code: "CONFIG_SECRET_DECRYPT_FAILED",
          details: undefined,
        });
    } finally {
      if (previousKey === undefined) {
        delete process.env.APP_CONFIG_ENCRYPTION_KEY;
      } else {
        process.env.APP_CONFIG_ENCRYPTION_KEY = previousKey;
      }
    }
  });
});
