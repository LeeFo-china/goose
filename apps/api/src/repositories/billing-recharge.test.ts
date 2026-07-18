import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const select = mock(() => query);
const range = mock(() => query);
const query = {
  select,
  eq: mock(() => query),
  or: mock(() => query),
  order: mock(() => query),
  range,
  then: (
    resolve: (value: { data: unknown[]; error: null; count: number }) => unknown,
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
};

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: () => query }),
  },
}));

describe("BillingRechargeRepository", () => {
  beforeEach(() => {
    select.mockClear();
    range.mockClear();
  });

  test("selects payment expiration in the paginated tenant order list", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");

    await billingRechargeRepository.listOrders({
      tenantId: "tenant-1",
      page: 2,
      pageSize: 10,
    });

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("payment_expires_at"),
      { count: "exact" },
    );
    expect(range).toHaveBeenCalledWith(10, 19);
  });
});
