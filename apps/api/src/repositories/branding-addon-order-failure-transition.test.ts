import { beforeEach, describe, expect, test } from "bun:test";

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
  is(column: string, value: unknown) {
    calls.push(["is", column, value]);
    return query;
  },
  select(columns: string) {
    calls.push(["select", columns]);
    return query;
  },
  async maybeSingle() {
    return result;
  },
};

const input = {
  tenantId: "tenant-a",
  orderId: "order-1",
  paymentConfigId: "config-1",
  expectedGuardVersion: 2,
};

describe("markBrandingAddonOrderFailedBeforePrepay", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: null, error: null };
  });

  test("fails only the exact pending order that has no prepay side effect", async () => {
    const { markBrandingAddonOrderFailedBeforePrepay } = await import(
      "./branding-addon-order-failure-transition"
    );
    result = { data: { id: "order-1", status: "failed" }, error: null };

    await markBrandingAddonOrderFailedBeforePrepay(query, input);

    expect(calls).toContainEqual(["update", {
      status: "failed",
      failure_code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
      failure_message: "支付配置或密钥版本在预下单前发生变化",
    }]);
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual(["eq", "payment_config_id", "config-1"]);
    expect(calls).toContainEqual(["eq", "expected_guard_version", 2]);
    expect(calls).toContainEqual(["is", "prepay_id", null]);
  });

  test("does not claim success when the conditional update misses", async () => {
    const { markBrandingAddonOrderFailedBeforePrepay } = await import(
      "./branding-addon-order-failure-transition"
    );
    await expect(
      markBrandingAddonOrderFailedBeforePrepay(query, input),
    ).resolves.toBeNull();
    expect(calls).toContainEqual(["is", "prepay_id", null]);
  });
});
