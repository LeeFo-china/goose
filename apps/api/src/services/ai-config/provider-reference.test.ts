import { expect, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { AiProviderPayload } from "@/schema/ai-config";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("redacts invalid references recursively without mutating persisted records", async () => {
  const { redactAiProviderReferences } = await import("./provider-reference");
  const invalid = ["synthetic", "legacy", "credential"].join("-");
  const input = {list: [{ api_key_setting_key: invalid, primary_model: { provider: {api_key_setting_key: invalid}}, fallback_model: {provider: {api_key_setting_key: "ARK_API_KEY"}}}]};
  const result = redactAiProviderReferences(input);
  expect(JSON.stringify(result)).not.toContain(invalid);
  expect(result.list[0]).toMatchObject({api_key_setting_key: null, api_key_setting_invalid: true, primary_model: {provider: {api_key_setting_key: null, api_key_setting_invalid: true}}, fallback_model: {provider: {api_key_setting_key: "ARK_API_KEY", api_key_setting_invalid: false}}});
  expect(input.list[0]?.api_key_setting_key).toBe(invalid);
  expect(redactAiProviderReferences({provider_type: "openrouter", api_key_setting_key: "ARK_API_KEY"})).toMatchObject({api_key_setting_key: null, api_key_setting_invalid: true});
});

test("validates direct service references but preserves omitted historical references and version", async () => {
  const { AiConfigService } = await import("./index");
  const auth = {tenantId: null, isPlatformStaff: true, permissions: [{code: "platform.ai_config.manage", scope: "all"}]} as AuthContext;
  const inputs: unknown[] = [];
  const record = {id: "provider", code: "provider", name: "new", provider_type: "openai_compatible", endpoint_url: null, api_key_setting_key: "historical", status: "active" as const, sort_order: 0, created_at: "now", updated_at: "now"};
  const service = new AiConfigService({configRepository: {
    getProviderById: async () => record,
    createProvider: async input => { inputs.push(input); return {...record, ...input, endpoint_url: input.endpoint_url ?? null}; },
    updateProvider: async (_id, input) => { inputs.push(input); return record; },
  }, secretSettingsService: {assertReference: async () => undefined}, auditRepository: {create: async () => { throw {code: "SYNTHETIC_AUDIT_UNAVAILABLE"}; }}});
  await expect(service.createProvider(auth, { name: "new", api_key_setting_key: "UNKNOWN_KEY" } as unknown as AiProviderPayload)).rejects.toMatchObject({statusCode: 400});
  await expect(service.updateProvider(auth, "provider", {expected_version: 7, api_key_setting_key: null} as unknown as Parameters<typeof service.updateProvider>[2])).rejects.toMatchObject({statusCode: 400});
  expect(inputs).toEqual([]);
  await service.updateProvider(auth, "provider", {expected_version: 7, name: "new"});
  await service.updateProvider(auth, "provider", {expected_version: 8, name: "renamed", provider_type: "openai_compatible"});
  expect(inputs).toEqual([
    {expected_version: 7, name: "new"},
    {expected_version: 8, name: "renamed", provider_type: "openai_compatible"},
  ]);
});

test("provider explicit references validate metadata and preserve OpenRouter canonical key", async () => {
  const { AiConfigService } = await import("./index");
  const { Errors } = await import("@/errors/error-factory");
  const auth = {tenantId: null, isPlatformStaff: true, permissions: [{code: "platform.ai_config.manage", scope: "all"}]} as AuthContext;
  const record = {id: "provider", code: "provider", name: "new", provider_type: "openrouter", endpoint_url: null, api_key_setting_key: "OPENROUTER_API_KEY", status: "active" as const, sort_order: 0, created_at: "now", updated_at: "now"};
  let writes = 0;
  const service = new AiConfigService({configRepository: {
    getProviderById: async () => record,
    createProvider: async () => {writes++; return record;},
    updateProvider: async () => {writes++; return record;},
  }, secretSettingsService: {assertReference: async () => {throw Errors.business(409, "配置引用异常", "AI_SECRET_SETTING_INVALID");}}});
  await expect(service.createProvider(auth, {name: "new", provider_type: "openrouter", api_key_setting_key: "ARK_API_KEY", status: "active", sort_order: 0})).rejects.toMatchObject({statusCode: 400});
  await expect(service.updateProvider(auth, "provider", {expected_version: 3, api_key_setting_key: "ARK_API_KEY"})).rejects.toMatchObject({statusCode: 400});
  await expect(service.createProvider(auth, {name: "new", provider_type: "openrouter", api_key_setting_key: "OPENROUTER_API_KEY", status: "active", sort_order: 0})).rejects.toMatchObject({statusCode: 409});
  await expect(service.updateProvider(auth, "provider", {expected_version: 3, provider_type: "openai_compatible"})).rejects.toMatchObject({statusCode: 409});
  expect(writes).toBe(0);
});
