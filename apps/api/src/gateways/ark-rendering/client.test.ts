import { describe, expect, test } from "bun:test";

import { generateArkRendering, requestArkVision } from "./index";
import { aiInferenceEndpoint } from "./requests";
import type { ArkFetch, ArkGatewayConfig } from "./index";

const config: ArkGatewayConfig = {
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3/",
  apiKey: "private-test-key",
  model: "configured-model",
  timeoutMs: 1_000,
};
const input = {
  roomImageUrl: "https://assets.example.com/room.jpg?signature=private",
  referenceImageUrl: "https://assets.example.com/reference.jpg",
  prompt: "保留房间结构，参考第二张图的配色。",
  size: "2K" as const,
};
const successPayload = {
  model: "configured-model",
  created_at: 1_700_000_000,
  data: [{ url: "https://images.example.com/result.jpg", size: "2048x2048" }],
  usage: { input_images: 2, generated_images: 1, output_tokens: 100, total_tokens: 100 },
};

test.each(["video", "speech"] as const)(
  "rejects unsupported %s modality before validating the Base URL",
  (modality) => {
    let error: unknown;
    try {
      aiInferenceEndpoint("not a URL", modality);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      statusCode: 400,
      code: "AI_MODALITY_RUNTIME_UNSUPPORTED",
    });
  },
);

describe("Ark rendering HTTP boundary", () => {
  test("sends the room and reference in fixed roles and requests exactly one watermarked image", async () => {
    let requestBody: unknown;
    const fetcher: ArkFetch = async (url, init) => {
      expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
      expect(init.method).toBe("POST");
      expect(init.redirect).toBe("error");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer private-test-key");
      requestBody = JSON.parse(String(init.body));
      return Response.json(successPayload, { headers: { "X-Request-Id": "req_123-abc" } });
    };
    const result = await generateArkRendering(config, input, { fetch: fetcher });
    expect(requestBody).toMatchObject({
      model: config.model,
      image: [input.roomImageUrl, input.referenceImageUrl],
      size: "2K",
      watermark: true,
      response_format: "url",
      stream: false,
    });
    expect(requestBody).not.toHaveProperty("sequential_image_generation");
    expect(requestBody).not.toHaveProperty("n");
    expect(requestBody).not.toHaveProperty("idempotency_key");
    expect(result).toEqual({ imageUrl: successPayload.data[0]!.url, usage: successPayload.usage, requestId: "req_123-abc" });
    expect(result).not.toHaveProperty("taskId");
  });

  test("does not duplicate a legacy stored image generations path", async () => {
    const fetcher: ArkFetch = async (url) => {
      expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
      return Response.json(successPayload);
    };

    await generateArkRendering({
      ...config,
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    }, input, { fetch: fetcher });
  });

  test.each([
    "http://ark.cn-beijing.volces.com/api/v3",
    "https://user:pass@ark.cn-beijing.volces.com/api/v3",
    "https://ark.cn-beijing.volces.com/api/v3?key=secret",
    "https://ark.cn-beijing.volces.com/api/v3#fragment",
    "https://ark.cn-beijing.volces.com/images/generations",
    "invalid",
  ])("rejects invalid base URL before submission: %s", async (baseUrl) => {
    let calls = 0;
    await expect(generateArkRendering({ ...config, baseUrl }, input, { fetch: async () => {
      calls += 1;
      return Response.json(successPayload);
    } })).rejects.toMatchObject({ code: "ARK_INVALID_CONFIGURATION" });
    expect(calls).toBe(0);
  });

  test("validates HTTPS image inputs and bounded request configuration before submitting", async () => {
    const fetcher: ArkFetch = async () => { throw "must not submit"; };
    await expect(generateArkRendering(config, { ...input, roomImageUrl: "data:image/png;base64,x" }, { fetch: fetcher }))
      .rejects.toMatchObject({ code: "ARK_INVALID_INPUT" });
    await expect(generateArkRendering({ ...config, timeoutMs: 0 }, input, { fetch: fetcher }))
      .rejects.toMatchObject({ code: "ARK_INVALID_CONFIGURATION" });
    await expect(generateArkRendering({ ...config, apiKey: "key\r\ninjected" }, input, { fetch: fetcher }))
      .rejects.toMatchObject({ code: "ARK_INVALID_CONFIGURATION" });
    await expect(generateArkRendering(config, { ...input, prompt: "x".repeat(32_001) }, { fetch: fetcher }))
      .rejects.toMatchObject({ code: "ARK_INVALID_INPUT" });
  });

  test.each([400, 401, 403, 404, 422, 429])("classifies explicit HTTP rejection %i without retry or secret exposure", async (status) => {
    let calls = 0;
    const error = await generateArkRendering(config, input, { fetch: async () => {
      calls += 1;
      return Response.json({ error: { message: `${config.apiKey} ${input.roomImageUrl}` } }, { status });
    } }).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "ARK_UPSTREAM_REJECTED", details: { outcome: "rejected", upstreamStatus: status } });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
    expect(JSON.stringify(error)).not.toContain("assets.example.com");
    expect(calls).toBe(1);
  });

  test("keeps a safe provider error code while discarding its message", async () => {
    const error = await generateArkRendering(config, input, {
      fetch: async () => Response.json({
        error: {
          code: "InvalidParameter.ImageURL",
          param: "image",
          message: `The image URL could not be downloaded ${config.apiKey} ${input.roomImageUrl}`,
        },
      }, { status: 400 }),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "ARK_UPSTREAM_REJECTED",
      details: {
        outcome: "rejected",
        upstreamStatus: 400,
        upstreamCode: "InvalidParameter.ImageURL",
        upstreamParam: "image",
        upstreamReason: "image_input_unavailable",
      },
    });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
    expect(JSON.stringify(error)).not.toContain("assets.example.com");
  });

  test.each([408, 409, 500, 502, 503])("conservatively marks ambiguous HTTP %i submission unknown", async (status) => {
    let calls = 0;
    await expect(generateArkRendering(config, input, { fetch: async () => {
      calls += 1;
      return Response.json({ error: { code: "InternalError" } }, { status });
    } })).rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN", details: { outcome: "submission_unknown" } });
    expect(calls).toBe(1);
  });

  test("network failure never retries or leaks the original error", async () => {
    let calls = 0;
    const error = await generateArkRendering(config, input, { fetch: async () => {
      calls += 1;
      throw new TypeError(`network ${config.apiKey}`);
    } }).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
    expect(calls).toBe(1);
  });

  test("timeout aborts the submitted request and remains unknown", async () => {
    let calls = 0;
    await expect(generateArkRendering({ ...config, timeoutMs: 10 }, input, { fetch: async (_url, init) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    } })).rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    expect(calls).toBe(1);
  });

  test("cancels a response arriving after the deadline without locking its body or retrying", async () => {
    let calls = 0;
    let canceled = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const delayedResponse = Promise.withResolvers<Response>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
      cancel() { canceled = true; },
    });
    const result = generateArkRendering({ ...config, timeoutMs: 10 }, input, { fetch: async () => {
      calls += 1;
      // Reproduce a transport that settles late and ignores the abort signal.
      return delayedResponse.promise;
    } });
    await expect(result).rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    delayedResponse.resolve(new Response(body));
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect({ canceled, locked: body.locked, calls }).toEqual({ canceled: true, locked: false, calls: 1 });
    } finally {
      // Close the hanging fixture if the cancellation regression recurs.
      if (!canceled) streamController?.close();
    }
  });

  test.each([
    {}, { data: [] }, { data: [{ url: "http://example.com/output.jpg" }] },
    { data: [{ url: "https://images.example.com/a" }, { url: "https://images.example.com/b" }] },
    { data: [{ b64_json: "secret" }] },
  ])("rejects malformed or unexpected image output conservatively", async (payload) => {
    await expect(generateArkRendering(config, input, { fetch: async () => Response.json(payload) }))
      .rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
  });

  test("recognizes explicit structured provider rejection in a success envelope", async () => {
    await expect(generateArkRendering(config, input, { fetch: async () => Response.json({ error: { code: "ContentPolicyViolation", message: "private" } }) }))
      .rejects.toMatchObject({ code: "ARK_UPSTREAM_REJECTED" });
  });

  test("does not return unsafe correlation or unknown usage fields", async () => {
    const result = await generateArkRendering(config, input, { fetch: async () => Response.json({
      ...successPayload, usage: { generated_images: 1, output_tokens: -1, secret: config.apiKey },
    }, { headers: { "X-Request-Id": "https://private.example.com/secret" } }) });
    expect(result).toEqual({ imageUrl: successPayload.data[0]!.url, usage: { generated_images: 1 } });
  });

  test("rejects truncated JSON and limits streamed response size", async () => {
    await expect(generateArkRendering(config, input, { fetch: async () => new Response('{"data":[') }))
      .rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    let canceled = false;
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(600_000)); },
      cancel() { canceled = true; },
    });
    await expect(generateArkRendering(config, input, { fetch: async () => new Response(oversized) }))
      .rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    expect(canceled).toBe(true);
  });

  test("cancels the response stream on invalid UTF-8 instead of leaving it downloading", async () => {
    let canceled = false;
    const invalidEncoding = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([0xff])); },
      cancel() { canceled = true; },
    });
    await expect(generateArkRendering(config, input, { fetch: async () => new Response(invalidEncoding) }))
      .rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
    expect(canceled).toBe(true);
  });
});

describe("Ark vision HTTP boundary", () => {
  const visionInput = { originalImageUrl: input.roomImageUrl, generatedImageUrl: successPayload.data[0]!.url, prompt: "输出观察和建议的 JSON。" };
  test("examines the original and actual generated images with explicit labels", async () => {
    const result = await requestArkVision(config, visionInput, { fetch: async (url, init) => {
      expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
      const body = JSON.parse(String(init.body));
      expect(body.messages[0].content).toEqual([
        { type: "text", text: visionInput.prompt },
        { type: "text", text: "原始房间照片" },
        { type: "image_url", image_url: { url: visionInput.originalImageUrl } },
        { type: "text", text: "实际生成的效果图" },
        { type: "image_url", image_url: { url: visionInput.generatedImageUrl } },
      ]);
      expect(body).toMatchObject({ model: config.model, stream: false, max_tokens: 4096 });
      return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"observed":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
    } });
    expect(result).toEqual({ text: '{"observed":[]}', usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
  });

  test.each(["length", "content_filter", "tool_calls", null])("rejects incomplete/filtered text with finish reason %s", async (finishReason) => {
    await expect(requestArkVision(config, visionInput, { fetch: async () => Response.json({ choices: [{ finish_reason: finishReason, message: { role: "assistant", content: "partial" } }] }) }))
      .rejects.toMatchObject({ code: "ARK_SUBMISSION_UNKNOWN" });
  });
});
