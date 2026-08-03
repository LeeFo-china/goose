import { describe, expect, test } from "bun:test";

const script = new URL("../../../scripts/resolve-web-deployment.mjs", import.meta.url).pathname;
function resolve(service: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(
    ["node", script, "deploy", service],
    { stderr: "pipe", stdout: "pipe" },
  );
}

describe("production deploy service resolver", () => {
  test("keeps the legacy all deployment while excluding web", () => {
    const result = resolve("all");
    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString().trim()).toBe(
      "api admin social-video-worker cos-reconcile-worker billing-reconcile-worker",
    );
  });

  test("allows a normalized web-only deployment request", () => {
    const result = resolve("web");
    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString().trim()).toBe("web");
  });

  test("rejects mixed web deployments", () => {
    const result = resolve("api,web");
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("Web must be deployed separately");
  });

  test("rejects unknown services", () => {
    const result = resolve("api,unknown");
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("Unknown service: unknown");
  });

  test("normalizes build all, whitespace, duplicates and worker image aliases", () => {
    const all = Bun.spawnSync(["node", script, "build", "all "]);
    const selected = Bun.spawnSync([
      "node",
      script,
      "build",
      "api, admin,,api,cos-reconcile-worker",
    ]);
    expect(all.stdout?.toString().trim()).toBe("api admin h5 web social-video-worker");
    expect(selected.stdout?.toString().trim()).toBe("api admin");
  });

  test("maps billing worker deployment to the shared API image", () => {
    const result = Bun.spawnSync([
      "node",
      script,
      "build",
      "billing-reconcile-worker",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString().trim()).toBe("api");
  });
});
