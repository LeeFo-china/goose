import { describe, expect, test } from "bun:test";

import {
  catalogIdentity,
  modelCode,
  projectCandidate,
  projectCandidates,
  textCandidates,
  type CatalogCandidate,
} from "./openrouter-catalog-projection";

const completeVideoCandidate: CatalogCandidate = {
  externalModelId: "openrouter/video-model",
  modelName: "Video Model",
  modality: "video",
  inputModalities: ["text", "image"],
  capabilityCandidate: {
    modality: "video",
    aspect_ratios: ["16:9"],
    max_duration_seconds: 10,
    supports_audio: true,
  },
  rawPriceProjection: { video: "0.05" },
};

const incompleteSpeechCandidate: CatalogCandidate = {
  externalModelId: "openrouter/speech-model",
  modelName: "Speech Model",
  modality: "speech",
  inputModalities: ["text"],
  capabilityCandidate: {
    modality: "speech",
    output_formats: ["mp3"],
  },
  rawPriceProjection: {},
};

describe("OpenRouter catalog projection", () => {
  test("builds modality-scoped identity and model codes", () => {
    expect(catalogIdentity("openai/gpt-4o", "text")).toBe("openai/gpt-4o\u0000text");
    expect(modelCode("openai/gpt-4o", "text")).toBe("openrouter.openai_gpt_4o");
    expect(modelCode("openai/gpt-4o", "image")).toBe("openrouter.image.openai_gpt_4o");
  });

  test("marks complete video candidates eligible", () => {
    expect(projectCandidate(completeVideoCandidate)).toMatchObject({
      modality: "video",
      apply_status: "eligible",
      apply_block_code: null,
      capability_payload: completeVideoCandidate.capabilityCandidate,
    });
  });

  test("uses parsed candidate capability for eligible current-model projections", () => {
    const projection = projectCandidate(completeVideoCandidate, {
      code: "openrouter.video.openrouter_video_model",
      name: "Video Model",
      model_name: "openrouter/video-model",
      modality: "video",
      input_modalities: ["text", "image"],
      capability_payload: {
        modality: "video",
        aspect_ratios: ["1:1"],
        max_duration_seconds: 5,
        supports_audio: false,
      },
      price_snapshot: { raw_price_projection: { video: "0.05" } },
    });

    expect(projection.apply_status).toBe("eligible");
    expect(projection.apply_block_code).toBeNull();
    expect(projection.capability_payload).toEqual(completeVideoCandidate.capabilityCandidate);
  });

  test("blocks text candidates with missing context length instead of inventing defaults", () => {
    const [candidate] = textCandidates([{
      id: "openrouter/text-no-context",
      name: "Text No Context",
      architecture: { output_modalities: ["text"] },
      pricing: { prompt: "0.1", completion: "0.2" },
      supported_parameters: ["stream"],
    }]);

    expect(candidate).toBeDefined();
    if (!candidate) throw new Error("expected text candidate");

    expect(projectCandidate(candidate)).toMatchObject({
      apply_status: "blocked",
      apply_block_code: "CAPABILITY_METADATA_INCOMPLETE",
      capability_payload: {
        modality: "text",
        supports_json_object: false,
        supports_streaming: true,
      },
    });
  });

  test("marks incomplete speech candidates blocked with bounded preview payload", () => {
    expect(projectCandidate(incompleteSpeechCandidate)).toMatchObject({
      modality: "speech",
      apply_status: "blocked",
      apply_block_code: "CAPABILITY_METADATA_INCOMPLETE",
      capability_payload: {
        modality: "speech",
        output_formats: ["mp3"],
      },
    });
  });

  test("omits OpenRouter negative sentinel prices and de-duplicates input modalities", () => {
    const projection = projectCandidate({
      ...completeVideoCandidate,
      inputModalities: ["text", "image", "text", "image"],
      rawPriceProjection: {
        video: "0.05",
        request: "-1",
        prompt: "0",
      },
    });

    expect(projection.input_modalities).toEqual(["text", "image"]);
    expect(projection.raw_price_projection).toEqual({ video: "0.05", prompt: "0" });
  });

  test("rejects conflicting duplicate candidates for the same external model and modality", () => {
    expect(() =>
      projectCandidates([
        completeVideoCandidate,
        {
          ...completeVideoCandidate,
          modelName: "Video Model v2",
        },
      ])).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "AI_OPENROUTER_CATALOG_DUPLICATE_CONFLICT",
        }),
      );
  });
});
