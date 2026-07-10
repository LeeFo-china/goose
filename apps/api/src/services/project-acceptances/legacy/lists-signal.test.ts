import { describe, expect, mock, test } from "bun:test";
import { listCustomerAcceptances } from "./lists";

const result = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

describe("listCustomerAcceptances signal ownership", () => {
  test("does not reuse a shared in-flight request when a signal is supplied", async () => {
    const signal = new AbortController().signal;
    const sharedRequest = Promise.resolve({
      ...result,
      pagination: { ...result.pagination, total: 99 },
    });
    const inFlight = new Map([["cache-key", sharedRequest]]);
    const loadCustomerAcceptanceSummaries = mock(async () => result);
    const context = {
      customerAcceptanceListCacheKey: mock(() => "cache-key"),
      getCachedCustomerAcceptanceList: mock(() => null),
      customerAcceptanceListInFlight: inFlight,
      loadCustomerAcceptanceSummaries,
      loadCustomerAcceptances: mock(async () => result),
      setCachedCustomerAcceptanceList: mock(() => undefined),
    };

    const loaded = await listCustomerAcceptances.call(
      context,
      "auth-1",
      { project_id: "project-1", page: 1, pageSize: 20 },
      { tenantId: "tenant-1", customerId: "customer-1" },
      { responseMode: "summary", signal },
    );

    expect(loaded.pagination.total).toBe(0);
    expect(loadCustomerAcceptanceSummaries).toHaveBeenCalledWith(
      "auth-1",
      { project_id: "project-1", page: 1, pageSize: 20 },
      { tenantId: "tenant-1", customerId: "customer-1" },
      { responseMode: "summary", signal },
    );
    expect(inFlight.get("cache-key")).toBe(sharedRequest);
  });
});
