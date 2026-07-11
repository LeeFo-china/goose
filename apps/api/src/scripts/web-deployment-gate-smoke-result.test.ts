import { describe, expect, test } from "bun:test";

import { evaluateWebGateSmokeCounts } from "./web-deployment-gate-smoke-result";

describe("web deployment gate smoke counts", () => {
  test("accepts only the exact single/IP/phone/device reservation counts", () => {
    expect(evaluateWebGateSmokeCounts({ single: 1, ip: 5, phone: 1, device: 1 }).passed).toBe(true);
  });

  test("rejects the previous zero-success false positive", () => {
    expect(evaluateWebGateSmokeCounts({ single: 0, ip: 0, phone: 0, device: 0 }).passed).toBe(false);
  });
});
