import { describe, expect, test } from "bun:test";

import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";

describe("resolveSupplierCommandAttempt", () => {
  test("reuses identity for an uncertain retry of the same request", () => {
    const first = resolveSupplierCommandAttempt(null, {
      scope: "supplier-product-create",
      resourcePath: "/supplier-products",
      payload: { name: "瓷砖" },
      allocateResourceId: true,
    });
    const retry = resolveSupplierCommandAttempt(first, {
      scope: "supplier-product-create",
      resourcePath: "/supplier-products",
      payload: { name: "瓷砖" },
      allocateResourceId: true,
    });

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.resourceId).toBe(first.resourceId);
  });

  test("allocates a new identity after the request meaning changes", () => {
    const current: SupplierCommandAttempt = {
      fingerprint: "old",
      idempotencyKey: "scope:old",
      resourceId: "70000000-0000-4000-8000-000000000001",
    };
    const next = resolveSupplierCommandAttempt(current, {
      scope: "supplier-product-create",
      resourcePath: "/supplier-products",
      payload: { name: "防滑瓷砖" },
      allocateResourceId: true,
    });

    expect(next).not.toBe(current);
    expect(next.idempotencyKey).not.toBe(current.idempotencyKey);
    expect(next.resourceId).not.toBe(current.resourceId);
  });
});
