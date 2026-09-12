import { arkGatewayError, getArkGatewayOutcome, type ArkUpstreamDiagnostics } from "./errors";
import type { ArkGatewayConfig, ArkGatewayDependencies } from "./types";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const EXPLICIT_REJECTION_STATUSES = new Set([400, 401, 403, 404, 405, 413, 415, 422, 429]);

function safeUpstreamDiagnostics(payload: unknown): ArkUpstreamDiagnostics {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return {};
  const raw = error as { code?: unknown; param?: unknown; message?: unknown };
  const upstreamCode = typeof raw.code === "string"
    && /^[A-Za-z0-9_.:-]{1,128}$/.test(raw.code) ? raw.code : undefined;
  const upstreamParam = typeof raw.param === "string"
    && /^[A-Za-z0-9_.\[\]-]{1,128}$/.test(raw.param) ? raw.param : undefined;
  const message = typeof raw.message === "string" ? raw.message.toLowerCase() : "";
  let upstreamReason: string | undefined;
  if (/sequential_image_generation/.test(message)) {
    upstreamReason = "sequential_image_generation_parameter";
  } else if (/(image|图片).*(url|download|fetch|access|下载|获取|访问)/.test(message)) {
    upstreamReason = "image_input_unavailable";
  } else if (upstreamParam === "model" || /\bmodel\b/.test(message)) {
    upstreamReason = "model_parameter";
  } else if (upstreamParam === "image" || /\bimage\b/.test(message)) {
    upstreamReason = "image_parameter";
  } else if (upstreamParam === "size" || /\bsize\b/.test(message)) {
    upstreamReason = "size_parameter";
  } else if (upstreamParam === "prompt" || /\bprompt\b/.test(message)) {
    upstreamReason = "prompt_parameter";
  } else if (upstreamCode === "InvalidParameter") {
    upstreamReason = "invalid_parameter";
  }
  return {
    ...(upstreamCode ? { upstreamCode } : {}),
    ...(upstreamParam ? { upstreamParam } : {}),
    ...(upstreamReason ? { upstreamReason } : {}),
  };
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    // Cancellation failures cannot change the already-unknown submission outcome.
    void response.body?.cancel().catch(() => undefined);
    throw arkGatewayError("submission_unknown");
  }
  if (!response.body) throw arkGatewayError("submission_unknown");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw arkGatewayError("submission_unknown");
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        cancel();
        throw arkGatewayError("submission_unknown");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** One attempt only: Ark image generation has no assumed server idempotency. */
export async function postArkJson(
  config: ArkGatewayConfig,
  request: { url: string; body: unknown },
  dependencies: ArkGatewayDependencies,
): Promise<{ payload: unknown; headers: Headers }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(arkGatewayError("submission_unknown"));
    }, config.timeoutMs);
  });
  const execute = async () => {
    const response = await (dependencies.fetch ?? fetch)(request.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request.body),
      redirect: "error",
      signal: controller.signal,
    });
    // A transport may resolve after the deadline; abort events are not replayed.
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw arkGatewayError("submission_unknown");
    }
    if (!response.ok) {
      if (EXPLICIT_REJECTION_STATUSES.has(response.status)) {
        const payload = await readBoundedJson(response, controller.signal).catch(() => null);
        throw arkGatewayError("rejected", response.status, safeUpstreamDiagnostics(payload));
      }
      void response.body?.cancel().catch(() => undefined);
      throw arkGatewayError("submission_unknown", response.status);
    }
    return { payload: await readBoundedJson(response, controller.signal), headers: response.headers };
  };
  try {
    return await Promise.race([execute(), deadline]);
  } catch (error) {
    if (getArkGatewayOutcome(error)) throw error;
    throw arkGatewayError("submission_unknown");
  } finally {
    clearTimeout(timer);
  }
}
