import { describe, expect, test } from "bun:test";

const script = new URL("./resolve-admin-release-services.mjs", import.meta.url).pathname;

function resolve(mode: string, services: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script, mode, services], {
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("admin release service resolver", () => {
  test.each([
    ["requested", "all", "api,admin,social-video-worker,cos-reconcile-worker"],
    ["build", "all", "api,admin,social-video-worker"],
    ["requested", "cos-reconcile-worker", "cos-reconcile-worker"],
    ["build", "cos-reconcile-worker", "api"],
    ["requested", "admin,api,admin", "api,admin"],
    ["requested", " admin, api, admin ", "api,admin"],
  ])("resolves %s services %s in dependency order", (mode, services, expected) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString("utf8")).toBe("");
    expect(result.stdout.toString("utf8").trim()).toBe(expected);
  });

  test.each([
    ["requested", "web"],
    ["requested", ""],
    ["deploy", "api"],
  ])("rejects invalid input %s %s", (mode, services) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString("utf8")).toBe("");
    expect(result.stderr.toString("utf8").trim().length).toBeGreaterThan(0);
  });
});
