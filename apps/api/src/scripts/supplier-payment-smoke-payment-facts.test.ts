import { describe, expect, test } from "bun:test";

import {
  assertFinalPaymentFacts,
  assertPartialPaymentFacts,
  assertPaymentReplayUnchanged,
  type PaymentFactExpectation,
  type PaymentFactSnapshot,
} from "./supplier-payment-smoke-payment-facts";

const expected: PaymentFactExpectation = {
  requestId: "request",
  projectId: "project",
  relationshipId: "relationship",
  supplierId: "supplier",
  firstPaymentId: "payment-1",
  finalPaymentId: "payment-2",
  allocations: [
    { id: "allocation-1", payableId: "payable-1", requestedAmount: "20.00" },
    { id: "allocation-2", payableId: "payable-2", requestedAmount: "10.00" },
  ],
};

function snapshot(final = false): PaymentFactSnapshot {
  return {
    request: {
      id: "request",
      status: final ? "paid" : "partially_paid",
      requested_amount: "30.00",
      paid_amount: final ? "30.00" : "10.00",
    },
    requestAllocations: [
      {
        id: "allocation-1",
        payment_request_id: "request",
        payable_event_id: "payable-1",
        requested_amount: "20.00",
        paid_amount: final ? "20.00" : "10.00",
      },
      {
        id: "allocation-2",
        payment_request_id: "request",
        payable_event_id: "payable-2",
        requested_amount: "10.00",
        paid_amount: final ? "10.00" : "0.00",
      },
    ],
    payments: [
      {
        id: "payment-1",
        payment_request_id: "request",
        project_id: "project",
        tenant_supplier_id: "relationship",
        supplier_id: "supplier",
        amount: "10.00",
      },
      ...(final
        ? [{
          id: "payment-2",
          payment_request_id: "request",
          project_id: "project",
          tenant_supplier_id: "relationship",
          supplier_id: "supplier",
          amount: "20.00",
        }]
        : []),
    ],
    paymentAllocations: [
      {
        supplier_payment_id: "payment-1",
        payment_request_id: "request",
        payment_request_allocation_id: "allocation-1",
        payable_event_id: "payable-1",
        amount: "10.00",
      },
      ...(final
        ? [
          {
            supplier_payment_id: "payment-2",
            payment_request_id: "request",
            payment_request_allocation_id: "allocation-1",
            payable_event_id: "payable-1",
            amount: "10.00",
          },
          {
            supplier_payment_id: "payment-2",
            payment_request_id: "request",
            payment_request_allocation_id: "allocation-2",
            payable_event_id: "payable-2",
            amount: "10.00",
          },
        ]
        : []),
    ],
    ledgers: final ? [{ source_id: "payment-1" }, { source_id: "payment-2" }] : [
      { source_id: "payment-1" },
    ],
  };
}

describe("supplier payment database facts", () => {
  test("validates the first 10.00 payment and exact allocation mapping", () => {
    expect(assertPartialPaymentFacts(snapshot(), expected)).toBe(true);
    const wrong = snapshot();
    wrong.paymentAllocations[0]!.payable_event_id = "wrong-payable";
    expect(() => assertPartialPaymentFacts(wrong, expected))
      .toThrow("partial payment facts");
  });

  test("requires replay to preserve complete rows and counts", () => {
    const before = snapshot();
    expect(assertPaymentReplayUnchanged(before, structuredClone(before)))
      .toBe(true);
    const changed = structuredClone(before);
    changed.payments[0]!.amount = "11.00";
    expect(() => assertPaymentReplayUnchanged(before, changed))
      .toThrow("replay");
  });

  test("validates the second 20.00 payment and final allocation balances", () => {
    expect(assertFinalPaymentFacts(snapshot(true), expected)).toBe(true);
    const wrong = snapshot(true);
    wrong.payments[1]!.amount = "19.00";
    expect(() => assertFinalPaymentFacts(wrong, expected))
      .toThrow("final second payment facts");
  });
});
