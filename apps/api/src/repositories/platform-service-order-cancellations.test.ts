import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let rpcResult: { data: unknown; error: unknown };
const rpc = mock(async (_name: string, _params: Record<string, unknown>) =>
  rpcResult
);
const client = { rpc };

describe("PlatformServiceOrderCancellationRepository", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpcResult = { data: null, error: null };
  });

  test("claims the idempotency key before external payment operations", async () => {
    const { PlatformServiceOrderCancellationRepository } = await import(
      "./platform-service-order-cancellations"
    );
    const repository = new PlatformServiceOrderCancellationRepository(
      () => client,
    );
    rpcResult = {
      data: { claimed: true, order: { id: "order-1" } },
      error: null,
    };

    await repository.claim({
      tenantId: "tenant-1",
      orderId: "order-1",
      expectedVersion: 3,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      reason: "user_changed_product",
      employeeId: "employee-1",
    });

    expect(rpc).toHaveBeenCalledWith(
      "platform_service_claim_pending_order_cancel",
      expect.objectContaining({
        p_order_id: "order-1",
        p_idempotency_key: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  test("finalizes with the observed missing-prepay guard", async () => {
    const { PlatformServiceOrderCancellationRepository } = await import(
      "./platform-service-order-cancellations"
    );
    const repository = new PlatformServiceOrderCancellationRepository(
      () => client,
    );

    await repository.finalize({
      tenantId: "tenant-1",
      orderId: "order-1",
      expectedVersion: 3,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      requireMissingPrepay: true,
    });

    expect(rpc).toHaveBeenCalledWith(
      "platform_service_cancel_pending_order",
      expect.objectContaining({ p_require_missing_prepay: true }),
    );
  });
});
