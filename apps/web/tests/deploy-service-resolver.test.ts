import { describe, expect, test } from "bun:test";

const script = new URL("../../../scripts/resolve-web-deployment.mjs", import.meta.url).pathname;
const currentSha = "0123456789abcdef";
const confirmation = "API_HEALTH_AND_SMS_CONCURRENCY_SMOKE_PASSED";

function resolve(
  service: string,
  migration = "",
  verifiedSha = "",
  smoke = "",
): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(
    ["node", script, service, migration, verifiedSha, smoke, currentSha],
    { stderr: "pipe", stdout: "pipe" },
  );
}

describe("production deploy service resolver", () => {
  test("keeps the legacy all deployment while excluding web", () => {
    const result = resolve("all");
    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString().trim()).toBe(
      "api admin social-video-worker cos-reconcile-worker",
    );
  });

  test("allows web-only deployment with evidence bound to the current SHA", () => {
    const result = resolve("web", "20260711120000", currentSha, confirmation);
    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString().trim()).toBe("web");
  });

  test("fails closed when web-only evidence is missing", () => {
    const result = resolve("web");
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("Web deployment gate rejected");
  });

  test("rejects mixed web deployments even with valid evidence", () => {
    const result = resolve(
      "api,web",
      "20260711120000",
      currentSha,
      confirmation,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("Web must be deployed separately");
  });

  test("rejects unknown services", () => {
    const result = resolve("api,unknown");
    expect(result.exitCode).toBe(1);
    expect(result.stderr?.toString() ?? "").toContain("Unknown service: unknown");
  });
});
