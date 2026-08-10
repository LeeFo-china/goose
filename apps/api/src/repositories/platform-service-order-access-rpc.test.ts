import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const client = {
  from: mock(() => ({})),
  rpc: mock(async () => rpcResult),
};

const paymentInput = {
  orderId: "order-1",
  transactionId: "transaction-1",
  paidAmountFen: 980000,
  paidAt: "2026-08-10T10:00:00.000Z",
  notificationId: null,
  metadata: {},
};
const acceptanceInput = {
  tenantId: "tenant-1",
  serviceOrderId: "order-1",
  decision: "accepted" as const,
  expectedWorkOrderVersion: 5,
  operatorEmployeeId: "employee-1",
};

function acceptedEnvelope() {
  return {
    order: { id: "order-1", service_status: "accepted" },
    work_order: { id: "work-1", status: "accepted" },
    acceptance_preparation: { id: "acceptance-1", status: "accepted" },
    contract: {
      id: "contract-1", tenant_id: "tenant-1", status: "active",
      service_start_at: "2026-08-10T10:00:00.000Z",
      service_end_at: "2027-08-10T10:00:00.000Z",
    },
    contract_period: {
      id: "period-1", contract_id: "contract-1", tenant_id: "tenant-1",
      service_order_id: "order-1", status: "active",
      starts_at: "2026-08-10T10:00:00.000Z",
      ends_at: "2027-08-10T10:00:00.000Z",
    },
    idempotent: false,
    error_code: null,
  };
}

describe("PlatformServiceOrderRepository access RPC results", () => {
  beforeEach(() => {
    rpcResult = { data: null, error: null };
    client.rpc.mockClear();
  });

  test("validates paid onboarding and accepted contract-period envelopes", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client as never);
    rpcResult = {
      data: {
        order: { id: "order-1", payment_status: "paid" },
        work_order: { id: "work-1", status: "waiting_assignment" },
        access_mode: "paid_onboarding",
        idempotent: false,
        error_code: null,
      },
      error: null,
    };
    expect((await repository.confirmPayment(paymentInput)).access_mode)
      .toBe("paid_onboarding");

    rpcResult = { data: acceptedEnvelope(), error: null };
    expect(await repository.decideAcceptance(acceptanceInput)).toMatchObject({
      contract: { id: "contract-1" },
      contractPeriod: { id: "period-1" },
      idempotent: false,
    });
  });

  test("fails closed without leaking malformed, resolved-error, or rejected RPC data", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client as never);
    rpcResult = {
      data: {
        order: { id: "order-1" }, work_order: { id: "work-1" },
        access_mode: "trial", idempotent: false,
      },
      error: null,
    };
    await expect(repository.confirmPayment(paymentInput)).rejects.toMatchObject({
      code: "DB_ERROR",
    });

    rpcResult = { data: null, error: { message: "SENSITIVE_DB_SENTINEL" } };
    await expectNoLeak(
      repository.decideAcceptance(acceptanceInput),
      "SENSITIVE_DB_SENTINEL",
    );
    client.rpc.mockRejectedValueOnce(new Error("SENSITIVE_REJECTION_SENTINEL"));
    await expectNoLeak(
      repository.confirmPayment(paymentInput),
      "SENSITIVE_REJECTION_SENTINEL",
    );
  });
});

async function expectNoLeak(promise: Promise<unknown>, sentinel: string) {
  try {
    await promise;
    throw new Error("expected repository failure");
  } catch (error) {
    expect(error).toMatchObject({ code: "DB_ERROR" });
    expect(JSON.stringify(error)).not.toContain(sentinel);
  }
}
