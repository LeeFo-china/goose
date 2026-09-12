import { arkGatewayError } from "./errors";
import type { ArkFetch } from "./types";

const MAX_RESULT_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const ALLOWED_RESULT_HOSTS = new Set([
  "ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com",
  "ark-acg-cn-beijing.tos-cn-beijing.volces.com",
]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface DownloadedArkImage {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

interface DownloadDependencies {
  fetch?: ArkFetch;
  timeoutMs?: number;
}

function parseResultUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.hash || !ALLOWED_RESULT_HOSTS.has(url.hostname)
      || !url.searchParams.get("X-Tos-Signature")) {
      throw arkGatewayError("result_unavailable");
    }
    return url;
  } catch {
    throw arkGatewayError("result_unavailable");
  }
}

function matchesSignature(bytes: Buffer, mimeType: DownloadedArkImage["mimeType"]): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)
    && Number(contentLength) > MAX_RESULT_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw arkGatewayError("result_unavailable");
  }
  if (!response.body) throw arkGatewayError("result_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw arkGatewayError("result_unavailable");
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_RESULT_BYTES) {
        cancel();
        throw arkGatewayError("result_unavailable");
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, total);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function downloadArkRenderingResult(
  value: string,
  dependencies: DownloadDependencies = {},
): Promise<DownloadedArkImage> {
  const url = parseResultUrl(value);
  const controller = new AbortController();
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(arkGatewayError("result_unavailable"));
    }, timeoutMs);
  });
  const execute = async (): Promise<DownloadedArkImage> => {
    const response = await (dependencies.fetch ?? fetch)(url.toString(), {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw arkGatewayError("result_unavailable");
    }
    const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      void response.body?.cancel().catch(() => undefined);
      throw arkGatewayError("result_unavailable");
    }
    const bytes = await readBoundedBody(response, controller.signal);
    const typedMime = mimeType as DownloadedArkImage["mimeType"];
    if (!matchesSignature(bytes, typedMime)) throw arkGatewayError("result_unavailable");
    return { bytes, mimeType: typedMime };
  };

  try {
    return await Promise.race([execute(), deadline]);
  } catch {
    throw arkGatewayError("result_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
