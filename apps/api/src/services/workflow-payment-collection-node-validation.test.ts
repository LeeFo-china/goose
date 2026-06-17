import { describe, expect, test } from "bun:test";
import type { WorkflowNodeRow } from "@/repositories/workflows";
import { findPaymentCollectionIssues } from "./workflow-payment-collection-node-validation";

const BASE_NODE = {
  id: "payment-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  node_key: "payment_deposit",
  node_type: "confirmation",
  business_kind: "payment_collection",
  title: "收定金",
  description: null,
  position: { x: 0, y: 0 },
  sort_order: 10,
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z",
} as const satisfies Omit<WorkflowNodeRow, "config">;

describe("findPaymentCollectionIssues", () => {
  test("requires a valid payment collection type", () => {
    expect(findPaymentCollectionIssues([
      paymentNode({ payment_type: null }),
      paymentNode({ node_key: "payment_custom", payment_type: "custom" }),
    ])).toEqual([
      "收款节点 payment_deposit 必须选择合法的收款类型",
      "收款节点 payment_custom 必须选择合法的收款类型",
    ]);
  });

  test("accepts valid payment collection node reviewer settings", () => {
    expect(findPaymentCollectionIssues([
      paymentNode({ payment_type: "deposit" }),
      paymentNode({
        node_key: "payment_stage_1",
        payment_type: "stage_1",
        finance_reviewer_employee_id: "employee-1",
        required_permissions: [],
      }),
    ])).toEqual([]);
  });

  test("requires finance reviewer or finance permission", () => {
    expect(findPaymentCollectionIssues([
      paymentNode({ payment_type: "deposit", required_permissions: [] }),
      paymentNode({
        node_key: "payment_stage_1",
        payment_type: "stage_1",
        finance_reviewer_employee_id: "",
        required_permissions: ["project.update"],
      }),
    ])).toEqual([
      "收款节点 payment_deposit 必须选择财务审核人或配置财务确认权限",
      "收款节点 payment_stage_1 必须选择财务审核人或配置财务确认权限",
    ]);
  });
});

function paymentNode(input: {
  node_key?: string;
  payment_type: unknown;
  finance_reviewer_employee_id?: string | null;
  required_permissions?: string[];
}): WorkflowNodeRow {
  return {
    ...BASE_NODE,
    node_key: input.node_key ?? BASE_NODE.node_key,
    config: {
      payment_type: input.payment_type,
      requirement_mode: "any_confirmed",
      finance_reviewer_employee_id: input.finance_reviewer_employee_id ?? null,
      required_permissions: input.required_permissions ?? ["finance.payment.confirm"],
    },
  };
}
