import { describe, expect, mock, test } from "bun:test";
import { downloadArkRenderingResult } from "./result-download";

const RESULT_URL = "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0-pro/result.jpeg?X-Tos-Signature=private";

describe("downloadArkRenderingResult", () => {
  test("downloads one bounded image from the confirmed Seedream output host", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(bytes, {
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(bytes.length),
        },
      });
    });

    expect(await downloadArkRenderingResult(RESULT_URL, { fetch: fetchImpl }))
      .toEqual({ bytes, mimeType: "image/jpeg" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each([
    "http://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.jpg",
    "https://user:pass@ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.jpg",
    "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com:8443/result.jpg",
    "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com.evil.test/result.jpg",
    "https://127.0.0.1/result.jpg",
    "https://ark-project.tos-cn-beijing.volces.com/result.jpg",
    "not-a-url",
  ])("rejects an untrusted result URL before fetching: %s", async (url) => {
    const fetchImpl = mock(async () => new Response("unexpected"));
    await expect(downloadArkRenderingResult(url, { fetch: fetchImpl }))
      .rejects.toMatchObject({ code: "ARK_RESULT_DOWNLOAD_FAILED" });
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  test.each(["text/html", "application/octet-stream", "image/svg+xml", "image/gif"])(
    "rejects unsupported content type %s",
    async (contentType) => {
      const fetchImpl = mock(async () => new Response("secret-response", {
        headers: { "content-type": contentType },
      }));
      await expect(downloadArkRenderingResult(RESULT_URL, { fetch: fetchImpl }))
        .rejects.toMatchObject({ code: "ARK_RESULT_DOWNLOAD_FAILED" });
    },
  );

  test("rejects bytes whose signature does not match the declared image type", async () => {
    await expect(downloadArkRenderingResult(RESULT_URL, {
      fetch: async () => new Response("not an image", {
        headers: { "content-type": "image/png" },
      }),
    })).rejects.toMatchObject({ code: "ARK_RESULT_DOWNLOAD_FAILED" });
  });

  test("rejects non-success responses and oversized content without leaking signed URL details", async () => {
    for (const response of [
      new Response("upstream secret", { status: 403 }),
      new Response("small", {
        headers: {
          "content-type": "image/png",
          "content-length": String(10 * 1024 * 1024 + 1),
        },
      }),
    ]) {
      let message = "";
      try {
        await downloadArkRenderingResult(RESULT_URL, {
          fetch: async () => response,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("效果图结果下载失败");
      expect(message).not.toContain("X-Tos-Signature");
      expect(message).not.toContain("upstream secret");
    }
  });

  test("cancels a streamed response that crosses the byte limit", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });

    await expect(downloadArkRenderingResult(RESULT_URL, {
      fetch: async () => new Response(stream, {
        headers: { "content-type": "image/webp" },
      }),
    })).rejects.toMatchObject({ code: "ARK_RESULT_DOWNLOAD_FAILED" });
    expect(cancelled).toBe(true);
  });

  test("aborts a stalled result download at the configured deadline", async () => {
    let aborted = false;
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((resolve) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          resolve();
        }, { once: true });
      });
      throw new DOMException("signed-url-secret", "AbortError");
    });

    await expect(downloadArkRenderingResult(RESULT_URL, {
      fetch: fetchImpl,
      timeoutMs: 5,
    })).rejects.toMatchObject({ code: "ARK_RESULT_DOWNLOAD_FAILED" });
    expect(aborted).toBe(true);
  });
});
