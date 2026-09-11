import { arkGatewayError } from "./errors";
import type { ArkGatewayConfig, ArkRenderingInput, ArkRenderingRequest, ArkVisionInput, ArkVisionRequest } from "./types";

const MAX_URL_LENGTH = 8192;
const MAX_PROMPT_LENGTH = 32_000;

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function arkEndpoint(config: ArkGatewayConfig, path: string): string {
  if (!isHttpsUrl(config.baseUrl)) throw arkGatewayError("invalid_configuration");
  const base = new URL(config.baseUrl);
  if (base.search || base.pathname.replace(/\/$/, "") !== "/api/v3"
    || !config.apiKey.trim() || config.apiKey.length > 4096 || /[\s\x00-\x1f\x7f]/.test(config.apiKey)
    || !config.model.trim() || config.model.length > 256 || /[\x00-\x1f\x7f]/.test(config.model)
    || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 600_000) {
    throw arkGatewayError("invalid_configuration");
  }
  return `${base.origin}/api/v3${path}`;
}

function validatePrompt(prompt: string): void {
  if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) throw arkGatewayError("invalid_input");
}

export function buildArkRenderingRequest(config: ArkGatewayConfig, input: ArkRenderingInput): ArkRenderingRequest {
  validatePrompt(input.prompt);
  if (!isHttpsUrl(input.roomImageUrl) || !isHttpsUrl(input.referenceImageUrl)
    || !["2K", "4K"].includes(input.size)) throw arkGatewayError("invalid_input");
  // Ark uses positional references: 图1 = original room, 图2 = style reference.
  return {
    model: config.model,
    prompt: `图1是原始房间照片，图2是装修风格参考图。保留图1的房间结构，参考图2的装修风格。\n${input.prompt}`,
    image: [input.roomImageUrl, input.referenceImageUrl],
    size: input.size,
    sequential_image_generation: "disabled" as const,
    response_format: "url" as const,
    watermark: true,
    stream: false,
  };
}

export function buildArkVisionRequest(config: ArkGatewayConfig, input: ArkVisionInput): ArkVisionRequest {
  validatePrompt(input.prompt);
  if (!isHttpsUrl(input.originalImageUrl) || !isHttpsUrl(input.generatedImageUrl)) {
    throw arkGatewayError("invalid_input");
  }
  return {
    model: config.model,
    messages: [{ role: "user", content: [
      { type: "text", text: input.prompt },
      { type: "text", text: "原始房间照片" },
      { type: "image_url", image_url: { url: input.originalImageUrl } },
      { type: "text", text: "实际生成的效果图" },
      { type: "image_url", image_url: { url: input.generatedImageUrl } },
    ] }],
    stream: false,
    max_tokens: 4096,
  };
}
