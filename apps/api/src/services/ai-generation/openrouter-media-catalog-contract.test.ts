import { describe, expect, test } from "bun:test";

import {
  OpenRouterImageModelListSchema,
  OpenRouterVideoModelListSchema,
} from "./openrouter-contract";

describe("OpenRouter media catalog contract", () => {
  test("parses current official image model catalog fields", () => {
    expect(OpenRouterImageModelListSchema.safeParse({
      data: [{
        id: "openrouter/image-model",
        name: "Image Model",
        architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
        supported_parameters: {
          input_references: { type: "integer", min: 0, max: 4 },
          n: { type: "integer", min: 1, max: 4 },
          resolution: { type: "enum", values: ["1K", "2K"] },
        },
      }],
    }).success).toBe(true);
  });

  test("parses current official video model catalog fields", () => {
    expect(OpenRouterVideoModelListSchema.safeParse({
      data: [{
        id: "openrouter/video-model",
        name: "Video Model",
        creativity: 0.5,
        hugging_face_id: null,
        upscale_factor: 2,
        generate_audio: true,
        supported_aspect_ratios: ["16:9"],
        supported_durations: [5, 10],
        pricing_skus: { "per-video-second": "0.05" },
      }],
    }).success).toBe(true);
  });

  test("parses nullable and structured optional video metadata", () => {
    expect(OpenRouterVideoModelListSchema.safeParse({
      data: [{
        id: "openrouter/video-model",
        name: "Video Model",
        creativity: ["low", "high"],
        upscale_factor: { min: 1, max: 2 },
        generate_audio: true,
        supported_aspect_ratios: null,
        supported_durations: null,
        supported_resolutions: null,
        pricing_skus: { "per-video-second": "0.05" },
      }],
    }).success).toBe(true);
  });
});
