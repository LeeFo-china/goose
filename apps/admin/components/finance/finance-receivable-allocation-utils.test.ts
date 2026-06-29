import { describe, expect, test } from "bun:test";
import {
  buildAllocationPaymentOptions,
  calculateReceivableAllocationSummary,
} from "./finance-receivable-allocation-utils";

describe("finance receivable allocation utils", () => {
  test("keeps only payments with remaining allocatable amount", () => {
    expect(buildAllocationPaymentOptions([
      {
        id: "payment-1",
        amount: 10000,
        allocated_amount: 3000,
        remaining_amount: 7000,
        pay_date: "2026-06-29T00:00:00.000Z",
        type: "stage_2",
        remark: "客户转账",
      },
      {
        id: "payment-2",
        amount: 5000,
        allocated_amount: 5000,
        remaining_amount: 0,
        pay_date: "2026-06-29T00:00:00.000Z",
        type: "stage_2",
        remark: null,
      },
    ])).toEqual([
      expect.objectContaining({
        value: "payment-1",
        remainingAmount: 7000,
      }),
    ]);
  });

  test("summarizes receivable allocation state", () => {
    expect(calculateReceivableAllocationSummary({
      amount: 10000,
      paid_amount: 3000,
      remaining_amount: 7000,
    })).toMatchObject({
      amount: 10000,
      paidAmount: 3000,
      remainingAmount: 7000,
      canAllocate: true,
    });
  });
});
