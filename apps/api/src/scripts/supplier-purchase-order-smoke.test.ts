import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  SMOKE_IDS,
  assertCommandResult,
  runWithForcedRollback,
} from "./supplier-purchase-order-smoke";

const fixtureSource = readFileSync(
  new URL("./supplier-purchase-order-smoke-fixture.ts", import.meta.url),
  "utf8",
);
const orderSmokeSource = readFileSync(
  new URL("./supplier-purchase-order-smoke.ts", import.meta.url),
  "utf8",
);
const orderRequisitionSource = readFileSync(
  new URL("./supplier-purchase-order-smoke-requisition.ts", import.meta.url),
  "utf8",
);

type FakeTransaction = {
  marker: string;
};

class FakeDatabase {
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

describe("supplier purchase order database smoke helpers", () => {
  test("uses stable UUIDs for the rollback-only database fixture", () => {
    expect(SMOKE_IDS.order).toBe(
      "23000000-0000-4000-8000-000000000001",
    );
    expect(new Set(Object.values(SMOKE_IDS)).size).toBe(
      Object.values(SMOKE_IDS).length,
    );
    expect(
      Object.values(SMOKE_IDS).every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
          .test(value)
      ),
    ).toBe(true);
  });

  test("seeds tenant supplier relationships with internal supplier codes", () => {
    expect(fixtureSource.match(/insert into public\.tenant_suppliers/g))
      .toHaveLength(2);
    expect(fixtureSource.match(/internal_supplier_code/g)).toHaveLength(2);
    expect(fixtureSource).toContain("'SMOKE-PO-SUPPLIER'");
    expect(fixtureSource).toContain("'SMOKE-PO-SUPPLIER-OTHER'");
  });

  test("seeds supplier SKUs with explicit empty structured specs", () => {
    expect(fixtureSource).toContain("insert into public.supplier_skus");
    expect(fixtureSource).toContain("spec_values");
    expect(fixtureSource).toContain("'{}'::jsonb");
  });

  test("publishes price lists through the supplier price command", () => {
    expect(fixtureSource).toContain("publishSupplierPriceList");
    expect(fixtureSource).toContain("command_supplier_price_list_v2");
    expect(fixtureSource).not.toContain("set lifecycle_status = 'published'");
  });

  test("creates smoke purchase orders from approved purchase requisitions", () => {
    expect(orderSmokeSource).toContain("createDraftOrderFromApprovedRequisition");
    expect(orderRequisitionSource).toContain("saveRequisition");
    expect(orderRequisitionSource).toContain("reviewRequisition");
    expect(orderRequisitionSource).toContain("convertRequisition");
    expect(orderSmokeSource).toContain("direct_creation_blocked");
    expect(orderSmokeSource).not.toContain(
      `await saveDraft(sql, fixture, 0, 2, "smoke-save-1")`,
    );
  });

  test("returns the smoke result only after forcing transaction rollback", async () => {
    const database = new FakeDatabase();

    const result = await runWithForcedRollback(database, async (transaction) => {
      expect(transaction).toBe(database.transaction);
      return { saved: true };
    });

    expect(result).toEqual({ saved: true });
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("preserves the original smoke failure after forcing rollback", async () => {
    const database = new FakeDatabase();
    const failure = new Error("smoke assertion failed");

    await expect(
      runWithForcedRollback(database, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(database.rollbacks).toBe(1);
    expect(database.commits).toBe(0);
  });

  test("validates command status, idempotency and string money facts", () => {
    expect(
      assertCommandResult(
        {
          status: "saved",
          idempotent: false,
          version: 1,
          purchase_order: {
            subtotal_amount: "70.80",
            tax_amount: "9.20",
            total_amount: "80.00",
          },
        },
        {
          status: "saved",
          idempotent: false,
          version: 1,
          totalAmount: "80.00",
        },
      ),
    ).toEqual({
      status: "saved",
      idempotent: false,
      version: 1,
      purchase_order: {
        subtotal_amount: "70.80",
        tax_amount: "9.20",
        total_amount: "80.00",
      },
    });

    expect(() =>
      assertCommandResult(
        {
          status: "saved",
          idempotent: false,
          version: 1,
          purchase_order: {
            subtotal_amount: "70.80",
            tax_amount: "9.20",
            total_amount: 80,
          },
        },
        {
          status: "saved",
          idempotent: false,
          version: 1,
          totalAmount: "80.00",
        },
      )
    ).toThrow("purchase_order.total_amount");
  });
});
