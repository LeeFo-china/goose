export interface ArkGatewayConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
}

export type ArkImageSize = "2K" | "4K";

export interface ArkRenderingInput {
  readonly roomImageUrl: string;
  readonly referenceImageUrl: string;
  readonly prompt: string;
  /** The caller must verify this size is supported by the configured model. */
  readonly size: ArkImageSize;
}

export interface ArkVisionInput {
  readonly originalImageUrl: string;
  readonly generatedImageUrl: string;
  readonly prompt: string;
}

export interface ArkRenderingRequest {
  model: string;
  prompt: string;
  image: [string, string];
  size: ArkImageSize;
  response_format: "url";
  watermark: true;
  stream: false;
}

type ArkVisionContent = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ArkVisionRequest {
  model: string;
  messages: [{ role: "user"; content: ArkVisionContent[] }];
  stream: false;
  max_tokens: number;
}

export interface ArkUsage {
  input_images?: number;
  generated_images?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ArkResponseMetadata {
  usage?: ArkUsage;
  /** Actual X-Request-Id response header; correlation only, never a task ID. */
  requestId?: string;
}

export interface ArkRenderingResult extends ArkResponseMetadata {
  imageUrl: string;
}

export interface ArkVisionResult extends ArkResponseMetadata {
  /** Untrusted model text; a business schema must validate before persistence/use. */
  text: string;
}

export type ArkFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ArkGatewayDependencies {
  fetch?: ArkFetch;
}
