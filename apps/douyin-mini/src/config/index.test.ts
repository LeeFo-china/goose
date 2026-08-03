import { describe, expect, test } from "bun:test";
import { ApiRequestError } from "../api/request";
import { resolveApiBaseUrl } from "./index";

describe("resolveApiBaseUrl", () => {
  test.each([
    ["development", "https://api-dev.goodcms.cn"],
    ["preview", "https://api-dev.goodcms.cn"],
    ["production", "https://api.goodcms.cn"],
  ] as const)("maps %s to its fixed API origin", (envType, expected) => {
    expect(resolveApiBaseUrl(envType)).toBe(expected);
  });

  test.each([
    "",
    "trial",
    "release",
    "Development",
    "toString",
    "constructor",
    "__proto__",
  ])(
    "rejects unknown environment %p without falling back to production",
    (envType) => {
      let caught: unknown;
      try {
        resolveApiBaseUrl(envType);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(caught).toMatchObject({
        statusCode: 0,
        code: "INVALID_API_CONFIG",
      });
    },
  );
});
