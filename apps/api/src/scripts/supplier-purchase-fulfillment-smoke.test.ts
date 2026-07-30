import { describe, expect, test } from "bun:test";

import {
  FULFILLMENT_SMOKE_IDS,
} from "./supplier-purchase-fulfillment-smoke-fixture";
import {
  assertFulfillmentFacts,
  assertFulfillmentCommandResult,
} from "./supplier-purchase-fulfillment-smoke-commands";
import {
  assertSupplierPurchaseFulfillmentSmokeSummary,
  runRollbackOnly,
  type SupplierPurchaseFulfillmentSmokeSummary,
} from "./supplier-purchase-fulfillment-smoke";

type FakeTransaction = { marker: string };

class FakeRollbackExecutor {
  commits = 0;
  rollbacks = 0;
  readonly transaction = { marker: "transaction" };

  async begin<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
    try {
      const result = await callback(this.transaction);
      this.commits += 1;
      return result;
    } catch (error) {
      this.rollbacks += 1;
      throw error;
    }
  }
}

const passingSummary: SupplierPurchaseFulfillmentSmokeSummary = {
  confirmed: true,
  confirmation_idempotent: true,
  shipment_created: true,
  shipment_idempotency_conflict: true,
  over_shipment_blocked: true,
  premature_receipt_blocked: true,
  partial_receipt_created: true,
  over_receipt_blocked: true,
  variance_reason_required: true,
  final_receipt_created: true,
  accepted_amount_correct: true,
  cancellation_after_shipment_blocked: true,
  tenant_isolation: true,
  transaction_rolled_back: true,
};

describe("supplier purchase fulfillment database smoke helpers", () => {
  test("uses stable and unique UUIDs for the rollback-only fixture", () => {
    expect(FULFILLMENT_SMOKE_IDS.order).toBe(
      "24000000-0000-4000-8000-000000000001",
    );
    expect(new Set(Object.values(FULFILLMENT_SMOKE_IDS)).size).toBe(
      Object.values(FULFILLMENT_SMOKE_IDS).length,
    );
    expect(
      Object.values(FULFILLMENT_SMOKE_IDS).every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
          .test(value)
      ),
    ).toBe(true);
  });

  test("exposes the canonical package command for the Task9 database run", async () => {
    const packageJson: { scripts: Record<string, string> } = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json();

    expect(
      packageJson.scripts["supplier:purchase-fulfillment-smoke"],
    ).toBe("bun src/scripts/supplier-purchase-fulfillment-smoke.ts");
  });

  test("returns only after the transaction executor rolls back", async () => {
    const database = new FakeRollbackExecutor();

    const result = await runRollbackOnly(database, async (transaction) => {
      expect(transaction).toBe(database.transaction);
      return { confirmed: true };
    });

    expect(result).toEqual({ confirmed: true });
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("rethrows the original failure after automatic rollback", async () => {
    const database = new FakeRollbackExecutor();
    const failure = new Error("original smoke failure");

    await expect(
      runRollbackOnly(database, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("rejects an executor that swallows the rollback sentinel", async () => {
    const unsafeExecutor = {
      async begin<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
        try {
          return await callback({ marker: "unsafe" });
        } catch {
          return undefined as T;
        }
      },
    };

    await expect(
      runRollbackOnly(unsafeExecutor, async () => ({ confirmed: true })),
    ).rejects.toThrow("did not propagate the rollback sentinel");
  });

  test("strictly validates status, idempotency, version and numeric strings", () => {
    expect(
      assertFulfillmentCommandResult(
        {
          status: "shipment_created",
          idempotent: false,
          version: 2,
          fulfillment: {
            status: "shipped",
          },
        },
        {
          status: "shipment_created",
          idempotent: false,
          version: 2,
          fulfillmentStatus: "shipped",
        },
      ),
    ).toMatchObject({ status: "shipment_created", version: 2 });

    for (const invalid of [
      { status: 2 },
      { idempotent: "false" },
      { version: "2" },
    ]) {
      expect(() =>
        assertFulfillmentCommandResult(
          {
            status: "shipment_created",
            idempotent: false,
            version: 2,
            fulfillment: {
              status: "shipped",
            },
            ...invalid,
          },
          {
            status: "shipment_created",
            idempotent: false,
            version: 2,
            fulfillmentStatus: "shipped",
          },
        )
      ).toThrow();
    }

    expect(
      assertFulfillmentFacts(
        {
          ordered_quantity: "10.0000",
          shipped_quantity: "10.0000",
          received_quantity: "10.0000",
          accepted_quantity: "9.0000",
          rejected_quantity: "1.0000",
          accepted_subtotal_amount: "79.65",
          accepted_tax_amount: "10.35",
          accepted_total_amount: "90.00",
        },
        {
          ordered: "10.0000",
          shipped: "10.0000",
          received: "10.0000",
          accepted: "9.0000",
          rejected: "1.0000",
          subtotal: "79.65",
          tax: "10.35",
          total: "90.00",
        },
      ),
    ).toEqual({
      ordered_quantity: "10.0000",
      shipped_quantity: "10.0000",
      received_quantity: "10.0000",
      accepted_quantity: "9.0000",
      rejected_quantity: "1.0000",
      accepted_subtotal_amount: "79.65",
      accepted_tax_amount: "10.35",
      accepted_total_amount: "90.00",
    });
    expect(() =>
      assertFulfillmentFacts(
        {
          ordered_quantity: 10,
          shipped_quantity: "10.0000",
          received_quantity: "10.0000",
          accepted_quantity: "9.0000",
          rejected_quantity: "1.0000",
          accepted_subtotal_amount: "79.65",
          accepted_tax_amount: "10.35",
          accepted_total_amount: "90.00",
        },
        {
          ordered: "10.0000",
          shipped: "10.0000",
          received: "10.0000",
          accepted: "9.0000",
          rejected: "1.0000",
          subtotal: "79.65",
          tax: "10.35",
          total: "90.00",
        },
      )
    ).toThrow("ordered_quantity");
    expect(() =>
      assertFulfillmentFacts(
        {
          ordered_quantity: "10.0000",
          shipped_quantity: "10.0000",
          received_quantity: "10.0000",
          accepted_quantity: "9.0000",
          rejected_quantity: "1.0000",
          accepted_subtotal_amount: 79.65,
          accepted_tax_amount: "10.35",
          accepted_total_amount: "90.00",
        },
        {
          ordered: "10.0000",
          shipped: "10.0000",
          received: "10.0000",
          accepted: "9.0000",
          rejected: "1.0000",
          subtotal: "79.65",
          tax: "10.35",
          total: "90.00",
        },
      )
    ).toThrow("accepted_subtotal_amount");
  });

  test("requires exactly the fourteen named boolean checks", () => {
    expect(assertSupplierPurchaseFulfillmentSmokeSummary(passingSummary))
      .toEqual(passingSummary);
    expect(() =>
      assertSupplierPurchaseFulfillmentSmokeSummary({
        ...passingSummary,
        accepted_amount_correct: "true",
      })
    ).toThrow("accepted_amount_correct");
    expect(() =>
      assertSupplierPurchaseFulfillmentSmokeSummary({
        ...passingSummary,
        unexpected_check: true,
      })
    ).toThrow("exactly 14 checks");
  });
});
