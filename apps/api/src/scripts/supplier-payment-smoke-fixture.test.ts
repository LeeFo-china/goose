import { describe, expect, test } from "bun:test";

describe("supplier payment smoke fixture contract", () => {
  test("creates every payment smoke order from an approved requisition", async () => {
    const fixtureSource = await Bun.file(new URL(
      "./supplier-payment-smoke-fixture.ts",
      import.meta.url,
    )).text();
    const smokeSource = await Bun.file(new URL(
      "./supplier-payment-smoke.ts",
      import.meta.url,
    )).text();

    expect(fixtureSource).not.toContain("saveDraft,");
    expect(fixtureSource).toContain("invoiceRequisition:");
    expect(fixtureSource).toMatch(
      /prepareRequisitionOrder\([\s\S]*invoiceRequisition[\s\S]*invoiceOrder/,
    );
    expect(smokeSource).toMatch(
      /supplier_purchase_requisitions[\s\S]*requisition[\s\S]*invoiceRequisition/,
    );
  });

  test("scopes purchase-order smoke command keys to the order", async () => {
    const commandSource = await Bun.file(new URL(
      "./supplier-purchase-order-smoke-commands.ts",
      import.meta.url,
    )).text();

    expect(commandSource).toContain(
      "smoke-submit-${expectedVersion}-${context.tenantId}-${context.orderId}",
    );
    expect(commandSource).toContain(
      "smoke-cancel-${expectedVersion}-${context.tenantId}-${context.orderId}",
    );
  });

  test("seeds multi-supplier payable cardinality for index planning", async () => {
    const explainFixtureSource = await Bun.file(new URL(
      "./supplier-payment-explain-fixture.ts",
      import.meta.url,
    )).text();
    const payableNoiseSource = await Bun.file(new URL(
      "./supplier-payment-explain-payable-noise.ts",
      import.meta.url,
    )).text();

    expect(explainFixtureSource).toContain("seedSupplierPayableNoise");
    expect(explainFixtureSource).toMatch(
      /supplier_payable_events[\s\S]*generate_series\(1, 100\)/,
    );
    expect(payableNoiseSource).toContain("explainNoiseSupplier");
    expect(payableNoiseSource).toMatch(/generate_series\(1, 5000\)/);
  });
});
