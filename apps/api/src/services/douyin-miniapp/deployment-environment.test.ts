import { describe, expect, test } from "bun:test";
import { resolveDouyinDeploymentEnvironment } from "./deployment-environment";

describe("resolveDouyinDeploymentEnvironment", () => {
  test.each([
    ["development", "development"],
    [" DEVELOPMENT ", "development"],
    ["production", "production"],
  ] as const)("normalizes %p", (raw, expected) => {
    expect(resolveDouyinDeploymentEnvironment(raw)).toBe(expected);
  });

  test.each([undefined, "", "preview", "staging"])(
    "rejects unsafe deployment environment %p",
    (raw) => {
      expect(() => resolveDouyinDeploymentEnvironment(raw)).toThrow(
        expect.objectContaining({
          statusCode: 503,
          code: "DOUYIN_DEPLOYMENT_ENVIRONMENT_INVALID",
        }),
      );
    },
  );
});
