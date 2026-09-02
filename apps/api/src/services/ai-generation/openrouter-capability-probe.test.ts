import { describe, expect, mock, test } from "bun:test";

import {
  OPENROUTER_PROBE_ENDPOINTS,
  runOpenRouterCapabilityProbe,
} from "./openrouter-capability-probe";

const apiKey = "sk-or-secret";

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function modelCatalog(data: Array<{ id: string; name?: string }>): {
  data: Array<{ id: string; name?: string }>;
  links: Record<string, never>;
  total_count: number;
} {
  return { data, links: {}, total_count: data.length };
}

describe("OpenRouter capability probe", () => {
  test("lists model catalogs with concurrency no higher than 3", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = mock(async (url: string | URL | Request) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/v1/models") {
        return jsonResponse(modelCatalog([{ id: "text-ok", name: "Text OK" }]));
      }
      if (pathname === "/api/v1/images/models") {
        return jsonResponse({ data: [{ id: "image-ok", name: "Image OK" }] });
      }
      if (pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [{ id: "video-ok", name: "Video OK" }] });
      }
      if (`${pathname}${new URL(String(url)).search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([{ id: "speech-ok", name: "Speech OK" }]));
      }
      throw new Error(`unexpected ${pathname}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      mode: "list-models",
      fetchImpl,
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(report.catalogs.map((catalog) => catalog.endpoint).sort()).toEqual([
      OPENROUTER_PROBE_ENDPOINTS.imageModels,
      OPENROUTER_PROBE_ENDPOINTS.models,
      OPENROUTER_PROBE_ENDPOINTS.speechModels,
      OPENROUTER_PROBE_ENDPOINTS.videoModels,
    ].sort());
  });

  test("marks image ineligible when the documented response lacks billing correlation", async () => {
    const requests: string[] = [];
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const parsedUrl = new URL(String(url));
      requests.push(`${parsedUrl.pathname}${parsedUrl.search}`);
      if (parsedUrl.pathname === "/api/v1/models") {
        return jsonResponse(modelCatalog([]));
      }
      if (parsedUrl.pathname === "/api/v1/images/models") {
        return jsonResponse({ data: [{ id: "image-ok", name: "Image OK" }] });
      }
      if (parsedUrl.pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [] });
      }
      if (`${parsedUrl.pathname}${parsedUrl.search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([]));
      }
      if (parsedUrl.pathname === "/api/v1/images") {
        return jsonResponse({
          created: 1_724_000_000,
          data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }],
        });
      }
      throw new Error(`unexpected ${parsedUrl.pathname}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { image: "image-ok" },
    });

    expect(requests).not.toContain("/api/v1/generation?id=gen_image_1");
    expect(report.modalities.find((item) => item.modality === "image")).toMatchObject({
      eligible: false,
      billingIdKind: "missing",
    });
  });

  test("probes requested text and video only when ids are in their modality catalogs", async () => {
    const requests: Array<{ pathname: string; body: unknown }> = [];
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const parsedUrl = new URL(String(url));
      const pathname = parsedUrl.pathname;
      requests.push({
        pathname,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (pathname === "/api/v1/models") {
        return jsonResponse(modelCatalog([
          { id: "text-ok", name: "Text OK" },
          { id: "image-only-in-wrong-catalog", name: "Image in wrong catalog" },
        ]));
      }
      if (pathname === "/api/v1/images/models") {
        return jsonResponse({ data: [{ id: "image-ok", name: "Image OK" }] });
      }
      if (pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [{ id: "video-ok", name: "Video OK" }] });
      }
      if (`${pathname}${parsedUrl.search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([{ id: "speech-ok", name: "Speech OK" }]));
      }
      if (pathname === "/api/v1/chat/completions") {
        return jsonResponse({
          id: "gen_text_1",
          object: "chat.completion",
          created: 1_724_000_000,
          model: "text-ok",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" } }],
        });
      }
      if (pathname === "/api/v1/videos") {
        return jsonResponse({
          id: "video_task_1",
          polling_url: "https://openrouter.ai/api/v1/videos/video_task_1",
          status: "pending",
        });
      }
      if (pathname === "/api/v1/videos/video_task_1") {
        return jsonResponse({
          id: "video_task_1",
          generation_id: "gen_video_1",
          polling_url: "https://openrouter.ai/api/v1/videos/video_task_1",
          status: "completed",
          unsigned_urls: [
            "https://openrouter.ai/api/v1/videos/video_task_1/content?index=0",
          ],
        });
      }
      if (pathname === "/api/v1/videos/video_task_1/content") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        });
      }
      if (pathname === "/api/v1/audio/speech") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
        });
      }
      if (pathname === "/api/v1/generation") {
        const id = parsedUrl.searchParams.get("id");
        return jsonResponse({ data: { id, total_cost: 0.0001 } });
      }
      throw new Error(`unexpected ${pathname}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: {
        text: "text-ok",
        image: "image-only-in-wrong-catalog",
        video: "video-ok",
        speech: "speech-ok",
      },
    });

    expect(report.modalities.map((item) => [item.modality, item.eligible])).toEqual([
      ["text", true],
      ["image", false],
      ["video", true],
      ["speech", false],
    ]);
    expect(requests.map((request) => request.pathname)).toContain("/api/v1/chat/completions");
    expect(requests.map((request) => request.pathname)).toContain("/api/v1/videos/video_task_1");
    expect(requests.map((request) => request.pathname))
      .toContain("/api/v1/videos/video_task_1/content");
    expect(JSON.stringify(requests)).not.toContain(apiKey);
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  test("polls video until completion and never sends authorization to external unsigned urls", async () => {
    const requests: Array<{ href: string; authorization: string | null }> = [];
    let pollCount = 0;
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const parsedUrl = new URL(String(url), "https://openrouter.ai");
      requests.push({
        href: parsedUrl.href,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (parsedUrl.pathname === "/api/v1/models") return jsonResponse(modelCatalog([]));
      if (parsedUrl.pathname === "/api/v1/images/models") return jsonResponse({ data: [] });
      if (parsedUrl.pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [{ id: "video-ok", name: "Video OK" }] });
      }
      if (`${parsedUrl.pathname}${parsedUrl.search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([]));
      }
      if (parsedUrl.pathname === "/api/v1/videos") {
        return jsonResponse({
          id: "video_task_1",
          polling_url: "/api/v1/videos/video_task_1",
          status: "pending",
        });
      }
      if (parsedUrl.pathname === "/api/v1/videos/video_task_1") {
        pollCount += 1;
        return jsonResponse(pollCount === 1
          ? {
            id: "video_task_1",
            polling_url: "/api/v1/videos/video_task_1",
            status: "in_progress",
          }
          : {
            id: "video_task_1",
            generation_id: "gen_video_1",
            polling_url: "/api/v1/videos/video_task_1",
            status: "completed",
            unsigned_urls: ["https://storage.example.com/video.mp4"],
          });
      }
      if (parsedUrl.pathname === "/api/v1/videos/video_task_1/content") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        });
      }
      if (parsedUrl.pathname === "/api/v1/generation") {
        return jsonResponse({ data: { id: "gen_video_1", total_cost: 0.0001 } });
      }
      throw new Error(`unexpected ${parsedUrl.href}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { video: "video-ok" },
      videoPoll: { intervalMs: 0, maxAttempts: 3 },
    });

    expect(pollCount).toBe(2);
    expect(requests.map((request) => request.href)).not.toContain("https://storage.example.com/video.mp4");
    expect(requests.find((request) => request.href.includes("/api/v1/videos/video_task_1/content"))
      ?.authorization).toBe(`Bearer ${apiKey}`);
    expect(report.modalities[0]).toMatchObject({
      modality: "video",
      eligible: true,
    });
  });

  test("rejects video poll responses for a different job and stops on cancellation", async () => {
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const parsedUrl = new URL(String(url), "https://openrouter.ai");
      if (parsedUrl.pathname === "/api/v1/models") return jsonResponse(modelCatalog([]));
      if (parsedUrl.pathname === "/api/v1/images/models") return jsonResponse({ data: [] });
      if (parsedUrl.pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [{ id: "video-ok", name: "Video OK" }] });
      }
      if (`${parsedUrl.pathname}${parsedUrl.search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([]));
      }
      if (parsedUrl.pathname === "/api/v1/videos") {
        return jsonResponse({
          id: "video_task_1",
          polling_url: "/api/v1/videos/video_task_1",
          status: "pending",
        });
      }
      if (parsedUrl.pathname === "/api/v1/videos/video_task_1") {
        return jsonResponse({
          id: "other_task",
          generation_id: "gen_video_1",
          polling_url: "/api/v1/videos/other_task",
          status: "completed",
          unsigned_urls: ["https://openrouter.ai/api/v1/videos/other_task/content"],
        });
      }
      if (parsedUrl.pathname === "/api/v1/videos/video_task_1/content") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        });
      }
      if (parsedUrl.pathname === "/api/v1/generation") {
        return jsonResponse({ data: { id: "gen_video_1", total_cost: 0.0001 } });
      }
      throw new Error(`unexpected ${parsedUrl.href}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { video: "video-ok" },
      videoPoll: { intervalMs: 0, maxAttempts: 3 },
    });

    expect(report.modalities[0]).toMatchObject({
      modality: "video",
      eligible: false,
      capabilities: { async: true, query: false, cancel: false, webhook: false },
    });
  });

  test("keeps speech ineligible when only an undocumented billing header appears", async () => {
    const requests: string[] = [];
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const pathname = new URL(String(url)).pathname;
      requests.push(pathname);
      if (`${pathname}${new URL(String(url)).search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([{ id: "speech-ok", name: "Speech OK" }]));
      }
      if (pathname === "/api/v1/models") {
        return jsonResponse(modelCatalog([]));
      }
      if (pathname === "/api/v1/images/models") {
        return jsonResponse({ data: [] });
      }
      if (pathname === "/api/v1/videos/models") {
        return jsonResponse({ data: [] });
      }
      if (pathname === "/api/v1/audio/speech") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "content-type": "audio/mpeg",
            "x-openrouter-generation-id": "gen_speech_1",
          },
        });
      }
      throw new Error(`unexpected ${pathname}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { speech: "speech-ok" },
    });

    expect(report.modalities[0]).toMatchObject({
      modality: "speech",
      billingIdKind: "missing",
      capabilities: { async: false, query: false, cancel: false, webhook: false },
      eligible: false,
    });
    expect(requests).toContain("/api/v1/audio/speech");
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  test("does not call chargeable speech endpoint when requested speech model is absent from speech catalog", async () => {
    const requests: string[] = [];
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const parsedUrl = new URL(String(url));
      const pathAndSearch = `${parsedUrl.pathname}${parsedUrl.search}`;
      requests.push(pathAndSearch);
      if (pathAndSearch === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([]));
      }
      if (parsedUrl.pathname === "/api/v1/models") return jsonResponse(modelCatalog([]));
      if (parsedUrl.pathname === "/api/v1/images/models") return jsonResponse({ data: [] });
      if (parsedUrl.pathname === "/api/v1/videos/models") return jsonResponse({ data: [] });
      if (parsedUrl.pathname === "/api/v1/audio/speech") {
        throw new Error("speech endpoint must not be called without catalog membership");
      }
      throw new Error(`unexpected ${pathAndSearch}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { speech: "not-in-speech-catalog" },
    });

    expect(requests).toContain("/api/v1/models?output_modalities=speech");
    expect(requests).not.toContain("/api/v1/audio/speech");
    expect(report.modalities[0]).toMatchObject({
      modality: "speech",
      endpoint: OPENROUTER_PROBE_ENDPOINTS.speech,
      eligible: false,
    });
  });

  test("does not report query capability when billing verification fails", async () => {
    const fetchImpl = mock(async (url: string | URL | Request) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/v1/models") {
        return jsonResponse(modelCatalog([{ id: "text-ok", name: "Text OK" }]));
      }
      if (pathname === "/api/v1/images/models") return jsonResponse({ data: [] });
      if (pathname === "/api/v1/videos/models") return jsonResponse({ data: [] });
      if (`${pathname}${new URL(String(url)).search}` === "/api/v1/models?output_modalities=speech") {
        return jsonResponse(modelCatalog([]));
      }
      if (pathname === "/api/v1/chat/completions") {
        return jsonResponse({
          id: "gen_text_1",
          object: "chat.completion",
          created: 1_724_000_000,
          model: "text-ok",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" } }],
        });
      }
      if (pathname === "/api/v1/generation") return jsonResponse({ error: "not found" }, 404);
      throw new Error(`unexpected ${pathname}`);
    });

    const report = await runOpenRouterCapabilityProbe({
      apiKey,
      fetchImpl,
      requestedModels: { text: "text-ok" },
    });

    expect(report.modalities[0]).toMatchObject({
      eligible: false,
      capabilities: { async: false, query: false, cancel: false, webhook: false },
    });
  });

});
