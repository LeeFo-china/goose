import { describe, expect, mock, test } from "bun:test";

import { runOpenRouterCapabilityProbeCli } from "./openrouter-capability-probe";

describe("OpenRouter capability probe CLI", () => {
  test("requires the explicit development probe gate before touching OpenRouter", async () => {
    const runProbe = mock(async () => {
      throw new Error("should not run");
    });
    const errors: string[] = [];

    const exitCode = await runOpenRouterCapabilityProbeCli({
      env: { OPENROUTER_API_KEY: "secret" },
      runProbe,
      writeReport: async () => undefined,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(runProbe).not.toHaveBeenCalled();
    expect(errors).toEqual(["OPENROUTER_CAPABILITY_PROBE_FAILED"]);
  });

  test("writes only sanitized reports and never prints secrets", async () => {
    const outputs: string[] = [];
    const written: string[] = [];
    const runProbe = mock(async () => ({
      generatedAt: "2026-09-03T00:00:00.000Z",
      catalogs: [{ endpoint: "/api/v1/models", modelIds: ["text-ok"] }],
      modalities: [{
        endpoint: "/api/v1/chat/completions",
        modality: "text" as const,
        requestSchemaVersion: "openrouter-contract-v1" as const,
        responseShape: { id: "gen_text_1", url: "https://tmp.example/video.mp4" },
        billingIdKind: "id" as const,
        capabilities: { async: false, query: true, cancel: false, webhook: false },
        eligible: true,
        authorization: "Bearer secret-openrouter-key",
        prompt: "raw prompt",
      }],
    }));

    const exitCode = await runOpenRouterCapabilityProbeCli({
      env: {
        OPENROUTER_CAPABILITY_PROBE: "1",
        GOOES_DEPLOY_ENV: "development",
        OPENROUTER_API_KEY: "secret-openrouter-key",
      },
      argv: ["--list-models"],
      runProbe,
      writeReport: async (_path, content) => {
        written.push(content);
      },
      writeOutput: (message) => outputs.push(message),
    });

    expect(exitCode).toBe(0);
    expect(JSON.stringify({ outputs, written })).not.toContain("secret-openrouter-key");
    expect(JSON.stringify({ outputs, written })).not.toContain("raw prompt");
    expect(written[0]).toContain("\"modelIds\": [");
    expect(written[0]).toContain("\"text-ok\"");
  });

  test("creates the report directory when using the default writer", async () => {
    const writes: string[] = [];
    const runProbe = mock(async () => ({
      generatedAt: "2026-09-03T00:00:00.000Z",
      catalogs: [],
      modalities: [],
    }));

    const exitCode = await runOpenRouterCapabilityProbeCli({
      env: {
        OPENROUTER_CAPABILITY_PROBE: "1",
        GOOES_DEPLOY_ENV: "development",
        OPENROUTER_API_KEY: "secret-openrouter-key",
      },
      argv: ["--list-models"],
      runProbe,
      ensureReportDirectory: async (path) => {
        writes.push(path);
      },
      writeReport: async () => undefined,
      writeOutput: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(writes).toEqual(["reports"]);
  });
});
