import { describe, expect, test } from "bun:test";
import { ApiRequestError } from "../api/request";
import { resolveApiBaseUrl } from "./index";

describe("resolveApiBaseUrl", () => {
  test.each([
    ["development", undefined, "https://api-dev.goodcms.cn"],
    ["preview", "development", "https://api-dev.goodcms.cn"],
    ["preview", "production", "https://api.goodcms.cn"],
    ["production", undefined, "https://api.goodcms.cn"],
    ["production", "production", "https://api.goodcms.cn"],
  ] as const)(
    "maps %s with deployment target %p to %s",
    (envType, deploymentEnvironment, expected) => {
      expect(resolveApiBaseUrl(envType, deploymentEnvironment)).toBe(expected);
    },
  );

  test("honors the production target when an experience build reports development", () => {
    expect(resolveApiBaseUrl("development", "production"))
      .toBe("https://api.goodcms.cn");
  });

  test.each([
    ["preview", undefined],
    ["preview", "staging"],
    ["production", "development"],
  ] as const)("rejects unsafe %s deployment target %p", (envType, target) => {
    expect(() => resolveApiBaseUrl(envType, target)).toThrow(ApiRequestError);
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
