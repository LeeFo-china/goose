import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_BATCH_CONCURRENCY_MANIFEST,
  classifyConcurrentReviewResults,
} from "./supplier-purchase-batch-concurrency";

describe("supplier purchase batch concurrency manifest", () => {
  test("requires one committed review and no duplicate side effects", () => {
    expect(SUPPLIER_PURCHASE_BATCH_CONCURRENCY_MANIFEST).toEqual({
      concurrentReviewers: 2,
      distinctReviewerIdentities: true,
      distinctIdempotencyKeys: true,
      acceptedOutcomes: ["winner", "version_conflict"],
      exactWinnerCount: 1,
      exactVersionConflictCount: 1,
      exactSubmittedOrderCount: 2,
      exactSuccessfulReviewEventCount: 1,
      exactConflictReviewEventCount: 1,
      exactTotalReviewEventCount: 2,
      committedFixtureWithScopedCleanup: true,
    });
  });

  test("requires a non-idempotent winner and one structured conflict", () => {
    expect(classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "version_conflict", idempotent: false },
    ])).toEqual({ winnerCount: 1, versionConflictCount: 1 });
    expect(() => classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "ordered", idempotent: true },
    ])).toThrow("one version conflict");
    expect(() => classifyConcurrentReviewResults([
      { status: "ordered", idempotent: false },
      { status: "ordered", idempotent: false },
    ])).toThrow("one version conflict");
  });
});
