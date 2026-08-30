import { describe, expect, test } from "bun:test";

import { buildSupplierPurchaseBatchActions } from
  "./workflow-task-supplier-purchase-batch-action-metadata";

describe("buildSupplierPurchaseBatchActions", () => {
  for (const nodeKey of ["purchase_review", "finance_review"]) {
    test(`describes approve and reject actions for ${nodeKey}`, () => {
      expect(buildSupplierPurchaseBatchActions(nodeKey)).toEqual([
        {
          key: "approve",
          label: "审批通过",
          business_domain: "supplier_purchase_batch",
          business_action: "approve",
          requires_reason: false,
          output_fields: [],
        },
        {
          key: "reject",
          label: "驳回修改",
          business_domain: "supplier_purchase_batch",
          business_action: "reject",
          requires_reason: true,
          output_fields: [],
        },
      ]);
    });
  }

  test("does not expose purchase actions outside review nodes", () => {
    expect(buildSupplierPurchaseBatchActions("approved_end")).toEqual([]);
  });
});
