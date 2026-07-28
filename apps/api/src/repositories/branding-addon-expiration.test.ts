import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const calls: Array<[string, ...unknown[]]> = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

const query = {
  update(patch: Record<string, unknown>) {
    calls.push(["update", patch]);
    return query;
  },
  eq(column: string, value: unknown) {
    calls.push(["eq", column, value]);
    return query;
  },
  select(columns: string) {
    calls.push(["select", columns]);
    return query;
  },
  maybeSingle: mock(async () => result),
};

const client = {
  from(table: string) {
    calls.push(["from", table]);
    return query;
  },
  rpc: mock(async (name: string, params: Record<string, unknown>) => {
    calls.push(["rpc", name, params]);
    return result;
  }),
};

describe("BrandingAddonExpirationRepository", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: null, error: null };
    query.maybeSingle.mockClear();
    client.rpc.mockClear();
  });

  test("claims a bounded batch with bounded exclusions", async () => {
    result = { data: [{ id: "order-1" }], error: null };
    const { BrandingAddonExpirationRepository } = await import(
      "./branding-addon-expiration"
    );
    const repository = new BrandingAddonExpirationRepository(() => client);
    const excludedOrderIds = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    await repository.claimExpiredOrders({
      batchSize: 500,
      leaseSeconds: 1,
      excludedOrderIds,
    });

    expect(calls).toContainEqual([
      "rpc",
      "branding_claim_expired_addon_orders",
      {
        p_limit: 100,
        p_lease_seconds: 10,
        p_excluded_ids: excludedOrderIds.slice(0, 100),
      },
    ]);
  });

  test("renews the exact database-clock lease", async () => {
    const { BrandingAddonExpirationRepository } = await import(
      "./branding-addon-expiration"
    );
    const repository = new BrandingAddonExpirationRepository(() => client);

    await repository.renewCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      leaseSeconds: 999,
    });

    expect(calls).toContainEqual([
      "rpc",
      "branding_renew_addon_close_claim",
      {
        p_order_id: "order-1",
        p_claim_token: "claim-1",
        p_lease_seconds: 600,
      },
    ]);
  });

  test("closes and releases only the exact pending claim", async () => {
    const { BrandingAddonExpirationRepository } = await import(
      "./branding-addon-expiration"
    );
    const repository = new BrandingAddonExpirationRepository(() => client);

    await repository.markOrderClosed({
      orderId: "order-1",
      claimToken: "claim-1",
      closedAt: new Date("2026-07-28T08:10:00.000Z"),
    });
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual(["eq", "close_claim_token", "claim-1"]);

    calls.length = 0;
    await repository.releaseCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: "x".repeat(501),
    });
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual(["eq", "close_claim_token", "claim-1"]);
    const updateCall = calls.find(([method]) => method === "update");
    expect((updateCall?.[1] as { close_last_error: string }).close_last_error)
      .toHaveLength(500);
  });
});
