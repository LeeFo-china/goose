import { describe, expect, test } from "bun:test";
import {
  AiCatalogEntryListQuerySchema,
  AiModelCapabilityPayloadSchema,
  AiModelPayloadSchema,
  AiProviderPayloadSchema,
  AiRouteModelOptionListQuerySchema,
  AiRouteModelOptionResolvePayloadSchema,
  UpdateAiProviderPayloadSchema,
} from "./ai-config";

describe("AI config schemas", () => {
  test("keeps ordinary model CRUD separate from capability override RPC", () => {
    expect(AiModelPayloadSchema.safeParse({
      provider_id: "11111111-1111-4111-8111-111111111111",
      code: "openrouter.text",
      name: "OpenRouter Text",
      model_name: "openai/gpt-4o-mini",
      capability_payload: {
        modality: "text",
        max_context_tokens: 128000,
        supports_json_object: true,
        supports_streaming: true,
      },
      probe_status: "eligible",
    }).success).toBe(false);

    expect(AiModelCapabilityPayloadSchema.safeParse({
      expected_version: 3,
      capability_payload: {
        modality: "text",
        max_context_tokens: 128000,
        supports_json_object: true,
        supports_streaming: true,
      },
      probe_status: "eligible",
    }).success).toBe(true);
  });

  test("keeps AI provider code as a system-owned field", () => {
    expect(AiProviderPayloadSchema.safeParse({
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "OPENROUTER_API_KEY",
      status: "active",
      sort_order: 10,
    }).success).toBe(true);

    expect(AiProviderPayloadSchema.safeParse({
      code: "manual-openrouter",
      name: "OpenRouter",
      provider_type: "openrouter",
    }).success).toBe(false);

    expect(UpdateAiProviderPayloadSchema.safeParse({
      expected_version: 1,
      code: "manual-openrouter",
      name: "OpenRouter",
    }).success).toBe(false);
  });

  test("rejects raw API secrets in provider key setting references", () => {
    expect(AiProviderPayloadSchema.safeParse({
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "sk-or-v1-secret",
    }).success).toBe(false);

    expect(UpdateAiProviderPayloadSchema.safeParse({
      expected_version: 1,
      api_key_setting_key: "Bearer secret-token",
    }).success).toBe(false);
  });

  test("accepts catalog entry search filters and rejects unknown modalities", () => {
    expect(AiCatalogEntryListQuerySchema.parse({
      page: "2",
      pageSize: "20",
      keyword: " claude ",
      modality: "image",
      changeType: "new",
    })).toMatchObject({
      page: 2,
      pageSize: 20,
      keyword: "claude",
      modality: "image",
      changeType: "new",
    });

    expect(AiCatalogEntryListQuerySchema.safeParse({
      modality: "multimodal",
    }).success).toBe(false);
  });

  test("accepts provider-scoped route model option filters", () => {
    expect(AiRouteModelOptionListQuerySchema.parse({
      page: "2",
      pageSize: "20",
      keyword: " gpt-4o ",
      modality: "text",
    })).toMatchObject({
      page: 2,
      pageSize: 20,
      keyword: "gpt-4o",
      modality: "text",
    });

    expect(AiRouteModelOptionListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
  });

  test("resolves route model options from catalog entries or manual text models", () => {
    expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
      source: "catalog",
      value: "33333333-3333-4333-8333-333333333333",
    }).success).toBe(true);

    expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
      source: "manual",
      model_name: "deepseek-chat",
      modality: "text",
    }).success).toBe(true);

    expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
      source: "manual",
      model_name: "video-model",
      modality: "video",
    }).success).toBe(false);
  });
});
