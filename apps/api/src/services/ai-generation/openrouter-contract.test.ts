import { describe, expect, test } from "bun:test";

import {
  OpenRouterAudioSpeechRequestSchema,
  OpenRouterCreditsSchema,
  OpenRouterGenerationUsageSchema,
  OpenRouterImageModelListSchema,
  OpenRouterImageResultSchema,
  OpenRouterModelListSchema,
  OpenRouterTextResultSchema,
  OpenRouterVideoModelListSchema,
  OpenRouterVideoStatusSchema,
  OpenRouterVideoSubmissionSchema,
  normalizeOpenRouterErrorKind,
  parseOpenRouterAudioResponse,
  parseOpenRouterVideoContentResponse,
} from "./openrouter-contract";

describe("OpenRouter strict contract", () => {
  test("parses current documented model catalogs for every supported modality", () => {
    expect(OpenRouterModelListSchema.safeParse({
      data: [{
        architecture: {
          input_modalities: ["text"],
          instruct_type: "chatml",
          modality: "text->text",
          output_modalities: ["text"],
          tokenizer: "GPT",
        },
        benchmarks: {
          design_arena: [{
            arena: "models",
            category: "website",
            elo: 1200,
            rank: 4,
            win_rate: 0.62,
          }],
        },
        canonical_slug: "openai/gpt-4",
        context_length: 8192,
        created: 1692901234,
        default_parameters: {
          repetition_penalty: 1,
          top_k: 40,
        },
        description: "GPT-4 is a large multimodal model.",
        expiration_date: null,
        id: "openai/gpt-4",
        knowledge_cutoff: null,
        links: { details: "/api/v1/models/openai/gpt-4/endpoints" },
        name: "GPT-4",
        per_request_limits: null,
        pricing: {
          completion: "0.00006",
          image: "0",
          overrides: [{
            min_prompt_tokens: 200000,
            prompt: "0.000005",
            completion: "0.00002",
          }],
          prompt: "0.00003",
          request: "0",
        },
        supported_parameters: ["temperature", "top_p", "max_tokens"],
        supported_voices: null,
        top_provider: {
          context_length: 8192,
          is_moderated: true,
          max_completion_tokens: 4096,
        },
      }],
      links: {},
      total_count: 1,
    }).success).toBe(true);
    expect(OpenRouterImageModelListSchema.safeParse({
      data: [{
        id: "bytedance-seed/seedream-4.5",
        name: "Seedream 4.5",
        description: "A text-to-image model.",
        created: 1692901234,
        architecture: {
          input_modalities: ["text", "image"],
          output_modalities: ["image"],
        },
        supported_parameters: {
          resolution: { type: "enum", values: ["1K", "2K", "4K"] },
          seed: { type: "boolean" },
        },
        supports_streaming: false,
        endpoints: "/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints",
      }],
    }).success).toBe(true);
    expect(OpenRouterVideoModelListSchema.safeParse({
      data: [{
        id: "google/veo-3.1",
        canonical_slug: "google/veo-3.1",
        name: "Google: Veo 3.1",
        description: "...",
        created: 1719792000,
        generate_audio: true,
        seed: null,
        supported_durations: [4, 6, 8],
        supported_resolutions: ["720p", "1080p"],
        supported_aspect_ratios: ["16:9", "9:16", "1:1"],
        supported_frame_images: ["first_frame", "last_frame"],
        supported_sizes: null,
        pricing_skus: { "per-video-second": "0.50" },
        allowed_passthrough_parameters: ["output_config"],
      }],
    }).success).toBe(true);
  });

  test("rejects unknown root fields from catalog responses", () => {
    expect(OpenRouterModelListSchema.safeParse({
      data: [{ id: "openrouter/text-model", name: "Text Model" }],
      links: {},
      total_count: 1,
      unsafe: "raw",
    }).success).toBe(false);
    expect(OpenRouterModelListSchema.safeParse({
      data: [{ id: "openrouter/text-model", name: "Text Model" }],
    }).success).toBe(false);
    expect(OpenRouterModelListSchema.safeParse({
      data: [{
        id: "openrouter/text-model",
        name: "Text Model",
        architecture: {
          input_modalities: ["text"],
          unsafe: "raw",
        },
      }],
      links: {},
      total_count: 1,
    }).success).toBe(false);
    expect(OpenRouterModelListSchema.safeParse({
      data: [{
        id: "openrouter/text-model",
        name: "Text Model",
        benchmarks: { invented_metric: { score: 1 } },
      }],
      links: {},
      total_count: 1,
    }).success).toBe(false);
  });

  test("parses current documented image output without inventing a root billing id", () => {
    expect(OpenRouterImageResultSchema.safeParse({
      created: 1748372400,
      data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 4175,
        total_tokens: 4175,
        cost: 0.04,
      },
    }).success).toBe(true);
    expect(OpenRouterImageResultSchema.safeParse({
      id: "undocumented-root-id",
      data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }],
    }).success).toBe(false);
    expect(OpenRouterImageResultSchema.safeParse({
      data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }],
      usage: { prompt_tokens: 0, raw: "unsafe" },
    }).success).toBe(false);
  });

  test("parses documented chat completion responses", () => {
    expect(OpenRouterTextResultSchema.safeParse({
      choices: [{
        finish_reason: "stop",
        index: 0,
        message: {
          content: "The capital of France is Paris.",
          role: "assistant",
        },
        logprobs: null,
      }],
      created: 1677652288,
      id: "chatcmpl-123",
      model: "openai/gpt-4",
      object: "chat.completion",
      openrouter_metadata: {
        attempt: 1,
        endpoints: {
          available: [{
            model: "openai/gpt-4",
            provider: "OpenAI",
            selected: true,
          }],
          total: 1,
        },
        is_byok: false,
        provider_name: "OpenAI",
        region: "us",
        requested: "openai/gpt-4",
        strategy: "lowest-price",
        summary: "OpenAI via OpenRouter",
      },
      service_tier: "priority",
      system_fingerprint: "fp_44709d6fcb",
      usage: {
        completion_tokens: 10,
        completion_tokens_details: { reasoning_tokens: 0 },
        cost: 0.95,
        cost_details: {
          upstream_inference_completions_cost: 12,
          upstream_inference_cost: null,
          upstream_inference_prompt_cost: 7,
        },
        is_byok: false,
        prompt_tokens: 25,
        prompt_tokens_details: {
          audio_tokens: 0,
          cached_tokens: 0,
          cache_write_tokens: 0,
        },
        server_tool_use_details: {
          tool_calls_executed: 1,
          tool_calls_requested: 2,
        },
        total_tokens: 35,
      },
    }).success).toBe(true);
  });

  test("requires a documented async video task id and polling URL", () => {
    expect(OpenRouterVideoSubmissionSchema.safeParse({
      id: "abc123",
      polling_url: "https://openrouter.ai/api/v1/videos/abc123",
      status: "pending",
    }).success).toBe(true);
    expect(OpenRouterVideoSubmissionSchema.safeParse({
      id: "abc123",
      polling_url: "/api/v1/videos/abc123",
      status: "pending",
    }).success).toBe(true);
    expect(OpenRouterVideoSubmissionSchema.safeParse({
      id: "abc123",
      status: "pending",
    }).success)
      .toBe(false);
  });

  test("parses video poll JSON and raw content responses strictly", async () => {
    expect(OpenRouterVideoStatusSchema.safeParse({
      id: "abc123",
      generation_id: "gen-1234567890-abcdef",
      polling_url: "https://openrouter.ai/api/v1/videos/abc123",
      status: "completed",
      unsigned_urls: ["https://openrouter.ai/api/v1/videos/abc123/content?index=0"],
      usage: { cost: 0.25, is_byok: false },
    }).success).toBe(true);
    expect(OpenRouterVideoStatusSchema.safeParse({
      id: "abc123",
      polling_url: "/api/v1/videos/abc123",
      status: "expired",
      error: "video expired",
    }).success).toBe(true);
    await expect(parseOpenRouterVideoContentResponse(new Response("<html>error</html>", {
      headers: { "content-type": "text/html" },
    }))).rejects.toMatchObject({ code: "AI_PROVIDER_RESPONSE_INVALID" });
    await expect(parseOpenRouterVideoContentResponse(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" },
    }))).resolves.toMatchObject({ contentType: "video/mp4" });
  });

  test("parses documented generation usage envelope and numeric cost", () => {
    expect(OpenRouterGenerationUsageSchema.safeParse({
      data: {
        api_type: "video",
        app_id: 12345,
        cache_discount: null,
        cancelled: false,
        created_at: "2024-07-15T23:33:19.433273+00:00",
        data_region: "global",
        external_user: "user-123",
        finish_reason: "stop",
        generation_time: 1200,
        http_referer: "https://openrouter.ai/",
        id: "gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG",
        is_byok: false,
        latency: 1250,
        model: "sao10k/l3-stheno-8b",
        moderation_latency: 50,
        native_finish_reason: "stop",
        native_tokens_cached: 3,
        native_tokens_completion: 25,
        native_tokens_completion_images: 0,
        native_tokens_prompt: 10,
        native_tokens_reasoning: 5,
        num_fetches: 0,
        num_input_audio_prompt: 0,
        num_media_completion: 0,
        num_media_prompt: 1,
        num_search_results: 5,
        origin: "https://openrouter.ai/",
        preset_id: "a9e8d400-592a-494f-908c-375efa66cafd",
        provider_name: "Infermatic",
        provider_responses: null,
        request_id: "req-1727282430-aBcDeFgHiJkLmNoPqRsT",
        router: "openrouter/auto",
        service_tier: "priority",
        session_id: null,
        streamed: true,
        tokens_completion: 25,
        tokens_prompt: 10,
        total_cost: 0.0015,
        upstream_id: "chatcmpl-791bcf62-080e-4568-87d0-94c72e3b4946",
        upstream_inference_cost: 0.0012,
        usage: 0.0015,
        user_agent: "Mozilla/5.0",
        web_search_engine: "exa",
        workspace_id: "550e8400-e29b-41d4-a716-446655440000",
      },
    }).success).toBe(true);
    expect(OpenRouterGenerationUsageSchema.safeParse({
      id: "gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG",
      total_cost: 0.0015,
    }).success)
      .toBe(false);
  });

  test("parses documented numeric credits envelope without accepting extra root fields", () => {
    expect(OpenRouterCreditsSchema.safeParse({
      data: { total_credits: 100.5, total_usage: 25.75 },
    }).success).toBe(true);
    expect(OpenRouterCreditsSchema.safeParse({
      data: { total_credits: 100.5, total_usage: 25.75 },
      key: "secret",
    }).success).toBe(false);
  });

  test("requires strict speech request input and rejects non-audio speech responses", async () => {
    expect(OpenRouterAudioSpeechRequestSchema.safeParse({
      model: "openrouter/speech-model",
      input: "生成配音",
      voice: "default",
      response_format: "mp3",
      speed: 1,
      provider: {
        options: {
          azure: {
            style: "cheerful",
            styledegree: 1.2,
          },
          openai: {
            instructions: "Speak in a warm, friendly tone.",
          },
        },
        only: ["openrouter/speech-provider"],
        allow_fallbacks: false,
      },
    }).success).toBe(true);
    expect(OpenRouterAudioSpeechRequestSchema.safeParse({
      model: "openrouter/speech-model",
      input: "生成配音",
      response_format: "mp3",
    }).success).toBe(false);

    const response = new Response("<html>error</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await expect(parseOpenRouterAudioResponse(response)).rejects.toMatchObject({
      code: "AI_PROVIDER_RESPONSE_INVALID",
    });
  });

  test("bounds audio and video byte streams even when content-length is absent", async () => {
    const audio = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    });
    await expect(parseOpenRouterAudioResponse(audio, { maxBytes: 2 }))
      .rejects.toMatchObject({ code: "AI_PROVIDER_RESPONSE_INVALID" });

    const video = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" },
    });
    await expect(parseOpenRouterVideoContentResponse(video, { maxBytes: 2 }))
      .rejects.toMatchObject({ code: "AI_PROVIDER_RESPONSE_INVALID" });
  });

  test("classifies provider failures without treating timeouts as terminal", () => {
    expect(normalizeOpenRouterErrorKind(502)).toBe("terminal_provider_failure");
    expect(normalizeOpenRouterErrorKind(529)).toBe("terminal_provider_failure");
    expect(normalizeOpenRouterErrorKind(524)).toBe("submission_unknown");
  });

  test.each([
    [400, "definitely_not_submitted"],
    [401, "definitely_not_submitted"],
    [429, "rate_limited"],
    [500, "submission_unknown"],
  ] as const)("classifies HTTP %d without leaking provider text", (status, kind) => {
    expect(normalizeOpenRouterErrorKind(status)).toBe(kind);
  });
});
