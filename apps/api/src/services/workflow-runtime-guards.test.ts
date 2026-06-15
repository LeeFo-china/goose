import { describe, expect, mock, test } from "bun:test";

const summarizeConfirmedProjectPayments = mock(async () => ({
  count: 0,
  totalAmount: 0,
}));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    findProjectSignedAmount: mock(async () => 100000),
    summarizeConfirmedProjectPayments,
  },
}));

describe("getPaymentCollectionCompletionBlock", () => {
  test("blocks payment collection completion before confirmed payment exists", async () => {
    const { getPaymentCollectionCompletionBlock } = await import(
      "./workflow-runtime-guards"
    );

    const block = await getPaymentCollectionCompletionBlock({
      projectId: "project-1",
      nodeSnapshot: {
        node_key: "payment_stage_2",
        business_kind: "payment_collection",
        config: {
          payment_type: "stage_2",
          block_message: "请先确认中期进度款已入账后再进入瓦工",
        },
      },
    });

    expect(block).toMatchObject({
      blocked: true,
      message: "请先确认中期进度款已入账后再进入瓦工",
      payment_type: "stage_2",
      confirmed_payment_count: 0,
      confirmed_amount: 0,
      requirement_mode: "any_confirmed",
    });
  });
});
