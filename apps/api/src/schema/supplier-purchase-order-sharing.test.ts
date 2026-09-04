import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseOrderPublicConfirmViewSchema,
  SupplierPurchaseOrderPublicTokenParamSchema,
  SupplierPurchaseOrderShareLinkCreateSchema,
} from "@/schema/supplier-purchase-order-sharing";

describe("supplier purchase order sharing schemas", () => {
  test("accepts a high entropy public token", () => {
    expect(
      SupplierPurchaseOrderPublicTokenParamSchema.parse({
        token: "pos_0123456789abcdefghijklmnopqrstuvwxyzABCDE",
      }),
    ).toEqual({
      token: "pos_0123456789abcdefghijklmnopqrstuvwxyzABCDE",
    });
  });

  test("rejects short or malformed public tokens", () => {
    expect(() =>
      SupplierPurchaseOrderPublicTokenParamSchema.parse({ token: "po_1" })
    ).toThrow();
    expect(() =>
      SupplierPurchaseOrderPublicTokenParamSchema.parse({
        token: "pos_中文中文中文中文中文中文中文中文中文中文中文中文中文中文中文中文",
      })
    ).toThrow();
  });

  test("parses optional share expiry and confirm remark", () => {
    expect(
      SupplierPurchaseOrderShareLinkCreateSchema.parse({
        expires_at: "2026-10-04T12:00:00+08:00",
      }),
    ).toEqual({ expires_at: "2026-10-04T12:00:00+08:00" });

    expect(
      SupplierPurchaseOrderPublicConfirmViewSchema.parse({
        confirmed_at: "2026-09-04T10:00:00+08:00",
        remark: " 已收到 ",
      }),
    ).toEqual({
      confirmed_at: "2026-09-04T10:00:00+08:00",
      remark: "已收到",
    });
  });
});
