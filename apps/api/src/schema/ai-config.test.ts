import { describe, expect, test } from "bun:test";

import {
  AiCatalogEntryListQuerySchema,
  AiModelCapabilityPayloadSchema,
  AiModelListQuerySchema,
  AiModelPayloadSchema,
  AiProviderPayloadSchema,
  AiRouteModelOptionListQuerySchema,
  AiRouteModelOptionResolvePayloadSchema,
  UpdateAiModelPayloadSchema,
  UpdateAiProviderPayloadSchema,
} from "./ai-config";

test("route model inspection view is optional, validated and bounded", () => {
  expect(AiRouteModelOptionListQuerySchema.parse({ view: "inspect" })).toMatchObject({ view: "inspect", page: 1, pageSize: 20 });
  expect(AiRouteModelOptionListQuerySchema.safeParse({ view: "catalog" }).success).toBe(false);
  expect(AiRouteModelOptionListQuerySchema.safeParse({ view: "inspect", pageSize: 101 }).success).toBe(false);
});

describe("AI config schemas", () => {
  test("limits provider references to registered AI secret keys", () => {
    for (const key of ["AI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "ARK_API_KEY"]) {
      expect(AiProviderPayloadSchema.safeParse({name: "供应商", api_key_setting_key: key}).success).toBe(true);
    }
    for (const key of ["UNKNOWN_KEY", "AI_MODEL", "", null]) {
      expect(AiProviderPayloadSchema.safeParse({name: "供应商", api_key_setting_key: key}).success).toBe(false);
      expect(UpdateAiProviderPayloadSchema.safeParse({expected_version: 1, api_key_setting_key: key}).success).toBe(false);
    }
    expect(AiProviderPayloadSchema.safeParse({name: "供应商"}).success).toBe(false);
    expect(UpdateAiProviderPayloadSchema.safeParse({expected_version: 1, name: "供应商"}).success).toBe(true);
  });
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
    const provider = {
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "OPENROUTER_API_KEY",
      status: "active",
      sort_order: 10,
    };

    expect(AiProviderPayloadSchema.safeParse(provider).success).toBe(true);

    expect(AiProviderPayloadSchema.safeParse({
      ...provider,
      code: "manual-openrouter",
    }).success).toBe(false);

    expect(UpdateAiProviderPayloadSchema.safeParse({
      expected_version: 1,
      code: "manual-openrouter",
      name: "OpenRouter",
    }).success).toBe(false);
  });

  test("keeps AI model code as a system-owned field on create and update", () => {
    const model = {
      provider_id: "11111111-1111-4111-8111-111111111111",
      name: "OpenRouter Text",
      model_name: "openai/gpt-4o-mini",
    };

    expect(AiModelPayloadSchema.safeParse(model).success).toBe(true);
    expect(AiModelPayloadSchema.safeParse({
      ...model,
      code: "manual-model-code",
    }).success).toBe(false);
    expect(UpdateAiModelPayloadSchema.safeParse({
      expected_version: 1,
      code: "manual-model-code",
      name: "OpenRouter Text",
    }).success).toBe(false);
  });

  test("does not inject create defaults into provider or model PATCH payloads", () => {
    expect(UpdateAiProviderPayloadSchema.parse({
      expected_version: 1,
      name: "OpenRouter renamed",
    })).toEqual({
      expected_version: 1,
      name: "OpenRouter renamed",
    });
    expect(UpdateAiModelPayloadSchema.parse({
      expected_version: 2,
      name: "GPT renamed",
    })).toEqual({
      expected_version: 2,
      name: "GPT renamed",
    });
  });

  test("accepts provider-scoped model list filters within pagination bounds", () => {
    expect(AiModelListQuerySchema.parse({
      page: "2",
      pageSize: "20",
      providerId: "11111111-1111-4111-8111-111111111111",
      modality: "image",
      status: "active",
      keyword: " seedream ",
    })).toEqual({
      page: 2,
      pageSize: 20,
      providerId: "11111111-1111-4111-8111-111111111111",
      modality: "image",
      status: "active",
      keyword: "seedream",
    });
    expect(AiModelListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(AiModelListQuerySchema.safeParse({ providerId: "not-a-uuid" }).success).toBe(false);
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

  test("rejects Ark credentials as setting references on create and update", () => {
    const credential = ["ark", "11111111", "2222", "4333", "8444", "555555555555", "synthetic"].join("-");
    expect(AiProviderPayloadSchema.safeParse({
      name: "火山方舟", api_key_setting_key: credential,
    }).success).toBe(false);
    expect(UpdateAiProviderPayloadSchema.safeParse({
      expected_version: 1, api_key_setting_key: credential,
    }).success).toBe(false);
    expect(AiProviderPayloadSchema.safeParse({
      name: "火山方舟", api_key_setting_key: "ARK_API_KEY",
    }).success).toBe(true);
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

  test("resolves route model options from catalog entries or manual multimodal models", () => {
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
      model_name: "image-model",
      name: " Image model ",
      modality: "image",
      input_modalities: ["text", "image"],
    }).success).toBe(true);

    expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
      source: "manual",
      model_name: "image-model",
      modality: "image",
      input_modalities: [],
    }).success).toBe(false);
  });
});
