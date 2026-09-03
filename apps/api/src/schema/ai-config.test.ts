import { describe, expect, test } from "bun:test";
import {
  AiModelCapabilityPayloadSchema,
  AiModelPayloadSchema,
  AiProviderPayloadSchema,
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
});
