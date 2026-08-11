import { describe, expect, test } from "bun:test";

describe("tenant platform service order trial attribution boundary", () => {
  test("passes the raw optional source only to the atomic repository command", async () => {
    const serviceSource = await Bun.file(
      new URL("./tenant-platform-service-orders.ts", import.meta.url),
    ).text();
    expect(serviceSource).toContain("sourceTrialId: input.source_trial_id");
    expect(serviceSource).not.toContain("findTrialById");
    expect(serviceSource).not.toContain("tenant_service_trials");
  });
});
