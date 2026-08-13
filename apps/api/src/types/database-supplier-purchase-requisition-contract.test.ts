import { describe, expect, test } from "bun:test";

import type { Database } from "./database";
import type { Inserts, Tables, Updates } from "./db";

type Functions = Database["public"]["Functions"];

describe("supplier purchase requisition database types", () => {
  test("exposes requisition, commitment, order source, and command contracts", () => {
    const requisition = {} as Tables<"supplier_purchase_requisitions">;
    const item = {} as Tables<"supplier_purchase_requisition_items">;
    const commitment = {} as Tables<"project_cost_commitments">;
    const existingSupplier = {} as Tables<"suppliers">;
    const existingProduct = {} as Tables<"supplier_products">;
    const existingRelationship = {} as Tables<"tenant_suppliers">;
    const orderUpdate: Updates<"supplier_purchase_orders"> = {
      purchase_requisition_id: null,
    };
    const commitmentInsert = {
      amount: 60,
      available_amount_snapshot: 100,
      budget_amount_snapshot: 100,
      cost_category_id: "00000000-0000-4000-8000-000000000001",
      created_by_employee_id: "00000000-0000-4000-8000-000000000002",
      expense_amount_snapshot: 0,
      other_commitment_amount_snapshot: 0,
      project_id: "00000000-0000-4000-8000-000000000003",
      source_id: "00000000-0000-4000-8000-000000000004",
      tenant_id: "00000000-0000-4000-8000-000000000005",
    } satisfies Inserts<"project_cost_commitments">;
    const purchaseOrderArgs: Functions["save_supplier_purchase_order_draft"]["Args"] = {
      p_actor_employee_id: "employee",
      p_actor_user_id: "user",
      p_expected_delivery_date: "2026-08-01",
      p_expected_version: 0,
      p_idempotency_key: "order-save",
      p_items: [],
      p_order_id: "order",
      p_project_id: "project",
      p_remark: "remark",
      p_tenant_id: "tenant",
      p_tenant_supplier_id: "relationship",
    };
    const commandNames: Array<keyof Functions> = [
      "save_supplier_purchase_requisition_draft",
      "submit_supplier_purchase_requisition",
      "review_supplier_purchase_requisition",
      "cancel_supplier_purchase_requisition",
      "convert_supplier_purchase_requisition",
      "list_project_cost_commitment_totals",
      "list_project_cost_expense_totals",
    ];
    const existingFunctionNames: Array<keyof Functions> = [
      "create_supplier_product",
      "set_tenant_supplier_module",
      "set_tenant_supplier_rollout_settings",
      "submit_supplier_purchase_order",
    ];

    expect([
      requisition.budget_status,
      requisition.purchase_order_id,
      item.cost_category_id,
      commitment.available_amount_snapshot,
      commitmentInsert.source_id,
      orderUpdate.purchase_requisition_id,
      purchaseOrderArgs.p_purchase_requisition_id,
      commandNames.length,
      existingSupplier.operational_status,
      existingProduct.product_code,
      existingRelationship.relationship_status,
      existingFunctionNames.length,
    ]).toHaveLength(12);
  });
});
