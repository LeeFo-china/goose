import { describe, expect, test } from "bun:test";

import { OpenRouterModelListSchema } from "./openrouter-model-catalog-contract";

describe("OpenRouter model catalog contract", () => {
  test("parses the current documented model metadata and routing prices", () => {
    const result = OpenRouterModelListSchema.safeParse({
      data: [{
        alias_target: {
          name: "Claude Sonnet 4.5",
          slug: "anthropic/claude-sonnet-4.5",
        },
        architecture: {
          input_modalities: ["text"],
          modality: "text->text",
          output_modalities: ["text"],
        },
        benchmarks: {
          artificial_analysis: {
            agentic_index: 55.8,
            coding_index: 63.2,
            intelligence_index: 71.4,
          },
          design_arena: [],
        },
        canonical_slug: "openrouter/auto",
        context_length: 200000,
        created: 1692901234,
        default_parameters: null,
        description: "Routes requests to an available model.",
        expiration_date: null,
        hugging_face_id: null,
        id: "openrouter/auto",
        knowledge_cutoff: null,
        links: { details: "/api/v1/models/openrouter/auto/endpoints" },
        name: "Auto Router",
        per_request_limits: null,
        pricing: {
          audio: "0",
          audio_output: "0",
          completion: "-1",
          image: "0",
          image_output: "0",
          image_token: "0",
          input_audio_cache: "0",
          input_cache_read: "0",
          input_cache_write: "0",
          input_cache_write_1h: "0",
          internal_reasoning: "0",
          overrides: [{
            input_cache_read: "0",
            input_cache_write: "0",
            min_prompt_tokens: 200000,
            prompt: "0.000005",
            utc_days: ["monday"],
            utc_end: 400,
            utc_start: 100,
          }],
          prompt: "-1",
          request: "0",
          web_search: "0",
        },
        reasoning: {
          default_effort: "medium",
          default_enabled: true,
          mandatory: false,
          supported_efforts: ["high", "medium", "low"],
          supports_max_tokens: true,
        },
        supported_parameters: ["temperature"],
        supported_voices: null,
        top_provider: {
          context_length: 200000,
          is_moderated: true,
          max_completion_tokens: 8192,
        },
      }],
      links: {},
      total_count: 1,
    });

    expect(result.success).toBe(true);
  });
});
