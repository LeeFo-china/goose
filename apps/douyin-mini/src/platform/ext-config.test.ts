import { afterEach, describe, expect, test } from "bun:test";
import { readDeploymentConfig } from "./ext-config";

const originalTtDescriptor = Object.getOwnPropertyDescriptor(globalThis, "tt");

function stubExtConfig(value: unknown): void {
  Object.defineProperty(globalThis, "tt", {
    configurable: true,
    value: { getExtConfigSync: () => value },
  });
}

afterEach(() => {
  if (originalTtDescriptor) {
    Object.defineProperty(globalThis, "tt", originalTtDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "tt");
});

describe("readDeploymentConfig", () => {
  test("reads and normalizes the official extConfig wrapper", () => {
    stubExtConfig({
      extConfig: {
        deployment_key: "  merchant-deployment-key  ",
        deployment_environment: "production",
      },
    });

    expect(readDeploymentConfig()).toEqual({
      deployment_key: "merchant-deployment-key",
      deployment_environment: "production",
    });
  });

  test.each(["development", "production"] as const)(
    "reads supported deployment environment %s",
    (deploymentEnvironment) => {
      stubExtConfig({ extConfig: { deployment_environment: deploymentEnvironment } });
      expect(readDeploymentConfig()).toEqual({
        deployment_environment: deploymentEnvironment,
      });
    },
  );

  test("drops an unsupported deployment environment", () => {
    stubExtConfig({
      extConfig: {
        deployment_key: "merchant-key",
        deployment_environment: "staging",
      },
    });
    expect(readDeploymentConfig()).toEqual({ deployment_key: "merchant-key" });
  });

  test.each([
    [{ ext: { deployment_key: "legacy-key" } }, "legacy-key"],
    [{ deployment_key: "direct-key" }, "direct-key"],
  ] as const)("keeps compatibility with %p", (raw, expected) => {
    stubExtConfig(raw);
    expect(readDeploymentConfig()).toEqual({ deployment_key: expected });
  });

  test("prefers the official wrapper when multiple shapes are present", () => {
    stubExtConfig({
      extConfig: { deployment_key: "official-key" },
      ext: { deployment_key: "legacy-key" },
      deployment_key: "direct-key",
    });

    expect(readDeploymentConfig()).toEqual({
      deployment_key: "official-key",
    });
  });

  test.each([
    { extConfig: { deployment_key: "" } },
    { extConfig: { deployment_key: " ".repeat(4) } },
    { extConfig: { deployment_key: 42 } },
    { extConfig: { deployment_key: "x".repeat(129) } },
    { extConfig: [] },
  ])("rejects invalid deployment config %p", (raw) => {
    stubExtConfig(raw);
    expect(readDeploymentConfig()).toEqual({});
  });
});
