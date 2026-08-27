import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_BATCH_CONCURRENCY_MANIFEST,
  classifyConcurrentReviewResults,
} from "./supplier-purchase-batch-concurrency";

describe("supplier purchase batch concurrency manifest", () => {
  test("requires one committed review and no duplicate side effects", () => {
    expect(SUPPLIER_PURCHASE_BATCH_CONCURRENCY_MANIFEST).toEqual({
      concurrentReviewers: 2,
      acceptedOutcomes: ["winner", "idempotent_replay", "version_conflict"],
      exactWinnerCount: 1,
      exactSubmittedOrderCount: 2,
      duplicateSideEffects: 0,
      transactionScopedFixture: true,
    });
  });

  test("classifies replay and version conflict as safe loser outcomes", () => {
    expect(classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "ordered", idempotent: true },
    ])).toEqual({ winnerCount: 1, safeLoserCount: 1 });
    expect(classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "version_conflict", idempotent: false },
    ])).toEqual({ winnerCount: 1, safeLoserCount: 1 });
    expect(() => classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "ordered", idempotent: false },
    ])).toThrow("exactly one winner");
  });
});
