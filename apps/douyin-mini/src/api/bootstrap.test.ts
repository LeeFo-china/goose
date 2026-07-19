import { describe, expect, test } from "bun:test";
import type { BootstrapData } from "../models";
import { fetchBootstrap } from "./bootstrap";
import { ApiClient } from "./request";

const bootstrap = {
  installation: { status: "active", template_version: "1.0.0" },
  company: {
    name: "示例装修公司",
    logo_url: null,
    summary: null,
    service_phone: "0371-00000000",
  },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: { cases_enabled: true },
  content: {},
  privacy_policy_version: "2026-07-19",
} satisfies BootstrapData;

function clientWith(value: unknown): ApiClient {
  return new ApiClient(
    { send: async () => value },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

describe("Douyin bootstrap response validation", () => {
  test("accepts a six-digit hexadecimal tenant theme color", async () => {
    await expect(fetchBootstrap(clientWith(bootstrap))).resolves.toEqual(bootstrap);
  });

  test("rejects a theme value that could escape an inline color declaration", async () => {
    const unsafe = {
      ...bootstrap,
      theme: { ...bootstrap.theme, primary_color: "red; display: none" },
    };

    await expect(fetchBootstrap(clientWith(unsafe))).rejects.toMatchObject({
      statusCode: 502,
      code: "INVALID_API_RESPONSE",
    });
  });
});
