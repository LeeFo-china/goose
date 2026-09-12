const STANDARD_INFERENCE_PATH_PATTERN = /\/(?:chat\/completions|images\/generations)\/?$/;
const INFERENCE_LEAF_NAMES = new Set([
  "completion",
  "completions",
  "generate",
  "generation",
  "generations",
  "infer",
  "inference",
  "predict",
  "prediction",
  "predictions",
  "responses",
]);

export function normalizeAiProviderBaseUrl(input: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(input);
  } catch {
    throw new TypeError("AI_PROVIDER_ENDPOINT_INVALID");
  }

  if (endpoint.protocol !== "https:") {
    throw new TypeError("AI_PROVIDER_ENDPOINT_HTTPS_REQUIRED");
  }
  if (endpoint.username || endpoint.password) {
    throw new TypeError("AI_PROVIDER_ENDPOINT_CREDENTIALS_UNSUPPORTED");
  }
  if (endpoint.href.includes("?")) {
    throw new TypeError("AI_PROVIDER_ENDPOINT_QUERY_UNSUPPORTED");
  }
  if (endpoint.href.includes("#")) {
    throw new TypeError("AI_PROVIDER_ENDPOINT_HASH_UNSUPPORTED");
  }

  const normalizedPath = endpoint.pathname.replace(STANDARD_INFERENCE_PATH_PATTERN, "");
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(normalizedPath);
  } catch {
    throw new TypeError("AI_PROVIDER_ENDPOINT_INVALID");
  }
  const leaf = decodedPath.split("/").filter(Boolean).at(-1)?.toLowerCase();
  if (leaf && INFERENCE_LEAF_NAMES.has(leaf)) {
    throw new TypeError("AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED");
  }

  endpoint.pathname = normalizedPath.replace(/\/+$/, "");
  return endpoint.toString().replace(/\/$/, "");
}
