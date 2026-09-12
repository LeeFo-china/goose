import { describe, expect, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const permissions = ["platform.ai_config.read", "platform.ai_config.manage", "platform.system_setting.read", "platform.system_setting.manage"];
const context = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  authUserId: "user", employeeId: null, tenantId: null, tenantName: null,
  tenantSlug: null, tenantStatus: null, isPlatformAdmin: false, isPlatformStaff: true,
  employeeName: "staff", employeeStatus: "active", departmentId: null,
  tenantDepartmentId: null, departmentCode: null, departmentName: null, postId: null,
  postName: null, avatar: null, roleCodes: [], roles: [],
  permissions: permissions.map(code => ({ code, scope: "all" })), ...overrides,
});
const record = (overrides = {}) => ({
  key: "AI_API_KEY", group_code: "ai", is_secret: true, status: "active" as const,
  value_type: "string" as const, has_value: true, ...overrides,
});

describe("AI secret settings", () => {
  test("never persists plaintext if setting metadata changes before existing encryption chain reads it", async () => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    const { SystemSettingRepository } = await import("@/repositories/system-settings");
    const { SystemSettingsService } = await import("@/services/system-settings/legacy-service");
    let writes = 0;
    const row = { id: "setting", tenant_id: null, ...record({is_secret: false}), name: "AI", description: null, value_text: null, updated_by_employee_id: null, created_at: "now", updated_at: "now" };
    const query = {
      select: () => query, eq: () => query, is: () => query,
      maybeSingle: async () => ({data: row, error: null}),
      update: () => { writes++; return query; },
      single: async () => ({data: row, error: null}),
    };
    const repository = new SystemSettingRepository({from: (table: string) => table === "system_settings" ? query : {insert: async () => ({error: null})}});
    const service = new AiSecretSettingsService({
      repository: {listPlatformAiSecretMetadata: async () => [record()]},
      settingsService: new SystemSettingsService(repository),
    });
    await expect(service.replace(context(), "AI_API_KEY", {value: "synthetic input"})).rejects.toMatchObject({statusCode: 500});
    expect(writes).toBe(0);
  });
  test.each([false, true])("platform staff encryption and change-log redaction survives metadata drift: %s", async (metadataDrifts) => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    const { SystemSettingRepository } = await import("@/repositories/system-settings");
    const { SystemSettingsService } = await import("@/services/system-settings/legacy-service");
    const { decryptSecretValue } = await import("@/services/system-settings/legacy/crypto");
    const previousEncryptionKey = process.env.APP_CONFIG_ENCRYPTION_KEY;
    process.env.APP_CONFIG_ENCRYPTION_KEY = "synthetic-test-encryption-config";
    const synthetic = ["synthetic", "replacement", "input"].join("-");
    let stored = { id: "setting", tenant_id: null, ...record(), name: "AI", description: null, value_text: null as string | null, updated_by_employee_id: null, created_at: "now", updated_at: "now" };
    const logs: unknown[] = [];
    const selections: string[] = [];
    const limits: number[] = [];
    let reads = 0;
    const query = {
      select: (fields: string) => { selections.push(fields); return query; },
      in: (_field: string, keys: string[]) => { expect(keys).toHaveLength(4); return query; },
      eq: () => query, is: () => query,
      limit: async (limit: number) => { limits.push(limit); return { data: [stored], error: null }; },
      maybeSingle: async () => ({data: metadataDrifts && ++reads === 3 ? {...stored, is_secret: false} : stored, error: null}),
      update: (value: {value_text: string | null}) => { stored = {...stored, ...value}; return query; },
      single: async () => ({data: stored, error: null}),
    };
    const repository = new SystemSettingRepository({from: (table: string) => table === "system_settings" ? query : {insert: async (value: unknown) => {logs.push(value); return {error: null}; }}});
    const service = new AiSecretSettingsService({repository, settingsService: new SystemSettingsService(repository), hasEnvValue: () => false});
    try {
      const result = await service.replace(context(), "AI_API_KEY", {value: synthetic});
      expect(result).toEqual({key: "AI_API_KEY", saved: true});
      expect(stored.value_text).toStartWith("enc:v1:");
      expect(decryptSecretValue(stored.value_text!)).toBe(synthetic);
      expect(logs).toEqual([{tenant_id: null, setting_key: "AI_API_KEY", old_value_text: null, new_value_text: null, changed_by_employee_id: null}]);
      expect(JSON.stringify({result, logs})).not.toContain(synthetic);
      expect(JSON.stringify({result, logs})).not.toContain(stored.value_text!);
      expect(limits).toEqual([4]);
      expect(selections[0]).toBe("key,group_code,is_secret,status,value_type,value_text");
    } finally {
      if (previousEncryptionKey === undefined) delete process.env.APP_CONFIG_ENCRYPTION_KEY;
      else process.env.APP_CONFIG_ENCRYPTION_KEY = previousEncryptionKey;
    }
  });
  test("returns four safe metadata entries without reading or decrypting secrets", async () => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    const service = new AiSecretSettingsService({
      repository: { listPlatformAiSecretMetadata: async () => [record(), record({ key: "ARK_API_KEY", is_secret: false })] },
      hasEnvValue: key => key === "DEEPSEEK_API_KEY",
    });
    const result = await service.list(context());
    expect(result.can_manage).toBe(true);
    expect(result.list).toHaveLength(4);
    expect(result.list.map(({key, source, status}) => ({key, source, status}))).toEqual([
      {key: "AI_API_KEY", source: "database", status: "configured"},
      {key: "DEEPSEEK_API_KEY", source: "env", status: "configured"},
      {key: "OPENROUTER_API_KEY", source: "empty", status: "empty"},
      {key: "ARK_API_KEY", source: "empty", status: "invalid"},
    ]);
    for (const item of result.list) expect(Object.keys(item).sort()).toEqual(["key", "name", "source", "status"]);
  });

  test("rejects tenant and missing permissions before metadata or persistence", async () => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    let calls = 0;
    const service = new AiSecretSettingsService({
      repository: { listPlatformAiSecretMetadata: async () => { calls++; return []; } },
      settingsService: { updateSetting: async () => { calls++; } },
    });
    for (const denied of [context({ tenantId: "tenant" }), context({ isPlatformStaff: false }), context({ permissions: [] })]) {
      await expect(service.list(denied)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.replace(denied, "unknown", { value: null })).rejects.toMatchObject({ statusCode: 403 });
    }
    for (const missing of permissions) {
      const auth = context({ permissions: context().permissions.filter(item => item.code !== missing) });
      await expect(missing.endsWith("read") ? service.list(auth) : service.replace(auth, "AI_API_KEY", { value: "synthetic" })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toBe(0);
  });

  test("rejects unknown keys, blank values and invalid metadata without writes", async () => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    let writes = 0;
    const dependencies = { settingsService: { updateSetting: async () => { writes++; } } };
    for (const row of [record({ is_secret: false }), record({ group_code: "payment" }), record({ status: "inactive" }), record({ value_type: "json" })]) {
      const service = new AiSecretSettingsService({ ...dependencies, repository: { listPlatformAiSecretMetadata: async () => [row] } });
      await expect(service.replace(context(), "AI_API_KEY", { value: "synthetic" })).rejects.toMatchObject({ statusCode: 409 });
    }
    const service = new AiSecretSettingsService({ ...dependencies });
    for (const key of ["UNKNOWN_KEY", "AI_MODEL", "synthetic credential"]) {
      await expect(service.replace(context(), key, { value: "synthetic" })).rejects.toMatchObject({ statusCode: 400 });
    }
    for (const body of [{value: null}, {value: "  "}, {value: "x".repeat(8193)}, {value: "ok", extra: true}]) {
      await expect(service.replace(context(), "AI_API_KEY", body)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(writes).toBe(0);
  });

  test("sanitizes persistence errors and discards secret-bearing write results", async () => {
    const { AiSecretSettingsService } = await import("./secret-settings");
    const synthetic = ["synthetic", "private", "input"].join("-");
    const repository = { listPlatformAiSecretMetadata: async () => [] };
    const calls: unknown[] = [];
    const service = new AiSecretSettingsService({ repository, settingsService: { updateSetting: async (...args) => { calls.push(args); return { value_text: synthetic }; } } });
    expect(await service.replace(context(), "ARK_API_KEY", {value: ` ${synthetic} `})).toEqual({key: "ARK_API_KEY", saved: true});
    expect(calls[0]).toEqual([context(), "ARK_API_KEY", synthetic]);
    const failing = new AiSecretSettingsService({ repository, settingsService: { updateSetting: async () => { throw {message: synthetic, details: synthetic}; } } });
    try { await failing.replace(context(), "ARK_API_KEY", {value: synthetic}); }
    catch (error) { expect(JSON.stringify(error)).not.toContain(synthetic); expect(error).toMatchObject({statusCode: 500}); }
  });
});
