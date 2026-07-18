import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "./billing-recharge";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const update = mock((_patch: Record<string, unknown>) => query);
const eq = mock((_column: string, _value: unknown) => query);
const gt = mock((_column: string, _value: unknown) => query);
const select = mock((_columns: string) => query);
const maybeSingle = mock(async () => ({
  data: { id: "order-1" } as unknown,
  error: null as unknown,
}));
const single = mock(async () => ({
  data: { id: "order-1" } as unknown,
  error: null as unknown,
}));
const query = { update, eq, gt, select, maybeSingle, single };

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: () => query }),
  },
}));

describe("billing recharge prepay persistence", () => {
  beforeEach(() => {
    for (const item of [update, eq, gt, select, maybeSingle, single]) {
      item.mockClear();
    }
    maybeSingle.mockImplementation(async () => ({
      data: { id: "order-1" },
      error: null,
    }));
  });

  test("writes prepay only while the tenant order remains pending and unexpired", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");
    const repository = billingRechargeRepository as unknown as {
      markPrepayCreated: (input: {
        tenantId: string;
        orderId: string;
        prepayId: string;
        now: Date;
      }) => Promise<TenantCreditOrderRecord | null>;
    };

    const result = await repository.markPrepayCreated({
      tenantId: "tenant-1",
      orderId: "order-1",
      prepayId: "prepay-1",
      now: new Date("2026-07-18T02:05:00.000Z"),
    });

    expect(update).toHaveBeenCalledWith({ prepay_id: "prepay-1" });
    expect(eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(eq).toHaveBeenCalledWith("id", "order-1");
    expect(eq).toHaveBeenCalledWith("status", "pending");
    expect(gt).toHaveBeenCalledWith(
      "payment_expires_at",
      "2026-07-18T02:05:00.000Z",
    );
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "order-1" });
  });

  test("returns null when the conditional update matches no order", async () => {
    maybeSingle.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");
    const repository = billingRechargeRepository as unknown as {
      markPrepayCreated: (input: {
        tenantId: string;
        orderId: string;
        prepayId: string;
        now: Date;
      }) => Promise<TenantCreditOrderRecord | null>;
    };
    const result = await repository.markPrepayCreated({
      tenantId: "tenant-1",
      orderId: "order-1",
      prepayId: "prepay-1",
      now: new Date("2026-07-18T02:05:00.000Z"),
    });

    expect(result).toBeNull();
  });
});
