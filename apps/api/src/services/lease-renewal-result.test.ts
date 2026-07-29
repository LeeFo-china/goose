import { describe, expect, test } from "bun:test";

import { classifyLeaseRenewal } from "@/services/lease-renewal-result";

describe("classifyLeaseRenewal", () => {
  test("keeps renewed values distinct from lost leases and repository errors", async () => {
    const value = { id: "order-1" };

    expect(await classifyLeaseRenewal(async () => value)).toEqual({
      status: "renewed",
      value,
    });
    expect(await classifyLeaseRenewal(async () => null)).toEqual({
      status: "lost",
    });
    expect(await classifyLeaseRenewal(async () => {
      throw new Error("database unavailable");
    })).toEqual({ status: "failed" });
  });
});
