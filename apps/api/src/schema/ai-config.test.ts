import { describe, expect, test } from "bun:test";
import {
  AiModelCapabilityPayloadSchema,
  AiModelPayloadSchema,
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
});
