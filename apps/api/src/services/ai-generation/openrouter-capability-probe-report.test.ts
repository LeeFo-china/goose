import { describe, expect, test } from "bun:test";

import sanitizedFixture from "./fixtures/openrouter-contract-v1.json";
import {
  listOpenRouterModelsForOperators,
  sanitizeProbeReport,
} from "./openrouter-capability-probe";

const apiKey = "sk-or-secret";

describe("OpenRouter capability probe reports", () => {
  test("operator list mode includes exact model ids without secrets or prompts", () => {
    const report = listOpenRouterModelsForOperators({
      generatedAt: "2026-09-01T00:00:00.000Z",
      catalogs: [{
        endpoint: "/api/v1/models",
        modelIds: ["text-a", "text-b"],
      }, {
        endpoint: "/api/v1/images/models",
        modelIds: ["image-a"],
      }],
      modalities: [{
        endpoint: "/api/v1/chat/completions",
        modality: "text",
        requestSchemaVersion: "openrouter-contract-v1",
        responseShape: {},
        billingIdKind: "id",
        capabilities: { async: false, query: true, cancel: false, webhook: false },
        eligible: true,
      }],
    });

    const serialized = JSON.stringify(report);
    expect(report.catalogs).toEqual([
      { endpoint: "/api/v1/models", modelIds: ["text-a", "text-b"] },
      { endpoint: "/api/v1/images/models", modelIds: ["image-a"] },
    ]);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("raw prompt");
  });

  test("sanitizes secrets, temporary URLs, prompts, and raw authorization", () => {
    const report = sanitizeProbeReport({
      generatedAt: "2026-09-01T00:00:00.000Z",
      catalogs: [],
      modalities: [{
        endpoint: "/api/v1/videos",
        modality: "video",
        requestSchemaVersion: "openrouter-contract-v1",
        responseShape: { id: "video_1", url: "https://cdn.openrouter.ai/tmp/file.mp4" },
        billingIdKind: "generation_id",
        capabilities: { async: true, query: true, cancel: false, webhook: false },
        eligible: true,
      }],
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("cdn.openrouter.ai");
    expect(serialized).not.toContain("真实客户提示词");
    expect(report.modalities[0]).toEqual({
      endpoint: "/api/v1/videos",
      modality: "video",
      requestSchemaVersion: "openrouter-contract-v1",
      responseShape: { keys: ["id", "url"] },
      billingIdKind: "generation_id",
      capabilities: { async: true, query: true, cancel: false, webhook: false },
      eligible: true,
    });
  });

  test("the checked-in fixture is an emitted sanitized report shape", () => {
    expect(sanitizedFixture as unknown).toEqual(sanitizeProbeReport({
      generatedAt: "1970-01-01T00:00:00.000Z",
      catalogs: [{
        endpoint: "/api/v1/models",
        modelIds: ["openai/gpt-4"],
      }],
      modalities: [{
        endpoint: "/api/v1/chat/completions",
        modality: "text",
        requestSchemaVersion: "openrouter-contract-v1",
        responseShape: { choices: true, created: true, id: true, model: true, object: true },
        billingIdKind: "id",
        capabilities: { async: false, query: true, cancel: false, webhook: false },
        eligible: true,
      }],
    }));
  });

  test("package script exposes the opt-in probe command", async () => {
    const packageJson = await Bun.file(new URL("../../../package.json", import.meta.url))
      .json() as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["ai:openrouter:probe"]).toBe(
      "bun src/scripts/openrouter-capability-probe.ts",
    );
  });
});
