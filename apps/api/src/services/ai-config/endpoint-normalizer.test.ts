import { describe, expect, test } from "bun:test";

import { normalizeAiProviderBaseUrl } from "./endpoint-normalizer";

describe("AI provider endpoint normalization", () => {
  test("removes a trailing slash without changing an Ark base path", () => {
    expect(normalizeAiProviderBaseUrl("https://ark.cn-beijing.volces.com/api/v3/"))
      .toBe("https://ark.cn-beijing.volces.com/api/v3");
  });

  test("strips only supported standard inference paths", () => {
    expect(normalizeAiProviderBaseUrl("https://api.example.com/v1/chat/completions"))
      .toBe("https://api.example.com/v1");
    expect(normalizeAiProviderBaseUrl("https://api.example.com/v1/images/generations/"))
      .toBe("https://api.example.com/v1");
  });

  test("requires HTTPS while preserving an HTTPS custom port", () => {
    expect(() => normalizeAiProviderBaseUrl("http://127.0.0.1:9000/v1"))
      .toThrowError("AI_PROVIDER_ENDPOINT_HTTPS_REQUIRED");
    expect(normalizeAiProviderBaseUrl("https://api.example.com:9443/v1/"))
      .toBe("https://api.example.com:9443/v1");
  });

  test("rejects malformed URLs", () => {
    expect(() => normalizeAiProviderBaseUrl("not a URL"))
      .toThrowError("AI_PROVIDER_ENDPOINT_INVALID");
  });

  test("rejects credentials, query strings and fragments", () => {
    expect(() => normalizeAiProviderBaseUrl("https://user:pass@api.example.com/v1"))
      .toThrowError("AI_PROVIDER_ENDPOINT_CREDENTIALS_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/v1?region=cn"))
      .toThrowError("AI_PROVIDER_ENDPOINT_QUERY_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/v1?"))
      .toThrowError("AI_PROVIDER_ENDPOINT_QUERY_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/v1#models"))
      .toThrowError("AI_PROVIDER_ENDPOINT_HASH_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/v1#"))
      .toThrowError("AI_PROVIDER_ENDPOINT_HASH_UNSUPPORTED");
  });

  test("accepts and normalizes a root URL", () => {
    expect(normalizeAiProviderBaseUrl("https://api.example.com/"))
      .toBe("https://api.example.com");
  });

  test("rejects unknown inference paths", () => {
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/private/infer"))
      .toThrowError("AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/private/%69nfer"))
      .toThrowError("AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/private/infer%2F"))
      .toThrowError("AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED");
    expect(() => normalizeAiProviderBaseUrl("https://api.example.com/private/infer/chat/completions"))
      .toThrowError("AI_PROVIDER_ENDPOINT_PATH_UNSUPPORTED");
  });
});
