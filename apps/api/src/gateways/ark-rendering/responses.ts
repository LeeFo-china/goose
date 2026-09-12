import { arkGatewayError } from "./errors";
import { isHttpsUrl } from "./requests";
import type { ArkRenderingResult, ArkResponseMetadata, ArkUsage, ArkVisionResult } from "./types";

const USAGE_FIELDS = ["input_images", "generated_images", "output_tokens", "prompt_tokens", "completion_tokens", "total_tokens"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(payload: Record<string, unknown>, headers: Headers): ArkResponseMetadata {
  const metadata: ArkResponseMetadata = {};
  const requestId = headers.get("X-Request-Id");
  if (requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId)) metadata.requestId = requestId;
  if (isRecord(payload.usage)) {
    const usage: ArkUsage = {};
    for (const field of USAGE_FIELDS) {
      const value = payload.usage[field];
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) usage[field] = value;
    }
    if (Object.keys(usage).length) metadata.usage = usage;
  }
  return metadata;
}

function validateEnvelope(payload: unknown): asserts payload is Record<string, unknown> {
  if (!isRecord(payload)) throw arkGatewayError("submission_unknown");
  if (payload.error) {
    const code = isRecord(payload.error) ? payload.error.code : undefined;
    const isExplicitRejection = typeof code === "string"
      && /^(ContentPolicyViolation|InvalidParameter|AuthenticationError|PermissionDenied|RateLimitExceeded)(\.|$)/.test(code);
    throw arkGatewayError(isExplicitRejection ? "rejected" : "submission_unknown");
  }
}

export function parseArkRenderingResponse(payload: unknown, headers: Headers): ArkRenderingResult {
  validateEnvelope(payload);
  if (!Array.isArray(payload.data) || payload.data.length !== 1) throw arkGatewayError("submission_unknown");
  const image = payload.data[0];
  if (!isRecord(image) || image.error || !isHttpsUrl(image.url)) throw arkGatewayError("submission_unknown");
  return { imageUrl: image.url, ...parseMetadata(payload, headers) };
}

export function parseArkVisionResponse(payload: unknown, headers: Headers): ArkVisionResult {
  validateEnvelope(payload);
  if (!Array.isArray(payload.choices) || payload.choices.length !== 1) throw arkGatewayError("submission_unknown");
  const choice = payload.choices[0];
  if (!isRecord(choice) || choice.finish_reason !== "stop" || !isRecord(choice.message)
    || choice.message.role !== "assistant" || typeof choice.message.content !== "string"
    || !choice.message.content.trim() || choice.message.content.length > 64_000
    || choice.message.refusal || choice.message.tool_calls) throw arkGatewayError("submission_unknown");
  return { text: choice.message.content, ...parseMetadata(payload, headers) };
}
