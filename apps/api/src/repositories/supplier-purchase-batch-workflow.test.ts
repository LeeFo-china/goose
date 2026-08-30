import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a1000000-0000-4000-8000-000000000001";
const BATCH_ID = "a1000000-0000-4000-8000-000000000002";
const PROJECT_ID = "a1000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "a1000000-0000-4000-8000-000000000004";
const USER_ID = "a1000000-0000-4000-8000-000000000005";
const REQUISITION_ID = "a1000000-0000-4000-8000-000000000006";
const DEFINITION_ID = "a1000000-0000-4000-8000-000000000007";
const INSTANCE_ID = "a1000000-0000-4000-8000-000000000008";
const AT = "2026-08-30T08:00:00.000Z";

const context = {
  tenant_id: TENANT_ID,
  batch_id: BATCH_ID,
  expected_version: 1,
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "workflow-submit-1",
};

const batch = {
  id: BATCH_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
  batch_no: "PB-20260830-00000001", status: "pending_approval",
  reason: "项目主材采购", expected_delivery_date: null, remark: null,
  priced_at: AT, currency: "CNY", subtotal_amount: "100.00",
  tax_amount: "13.00", total_amount: "113.00", budget_checked_at: AT,
  budget_status: "within_budget", budget_snapshot: {}, split_generation: 1,
  supplier_count: 1, item_count: 1, version: 2, approval_round: 1,
  created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID, submitted_at: AT,
  reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
  cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  created_at: AT, updated_at: AT,
} as const;

const workflowState = {
  definition_id: DEFINITION_ID,
  instance_id: INSTANCE_ID,
  instance_status: "running",
  current_node_key: "purchase_review",
  current_node_title: "采购审批",
  current_business_kind: null,
  pending_task_count: 1,
} as const;

describe("SupplierPurchaseBatchWorkflowRepository", () => {
  test("calls the dedicated RPC and validates its success identity", async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client = { async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return { data: { status: "submitted", idempotent: false, batch,
        version: 2, requisition_ids: [REQUISITION_ID],
        workflow_state: workflowState }, error: null };
    } };
    const { SupplierPurchaseBatchWorkflowRepository } = await import(
      "./supplier-purchase-batch-workflow"
    );
    const repository = new SupplierPurchaseBatchWorkflowRepository(
      () => client,
    );

    expect(await repository.submit(context)).toEqual({
      status: "submitted", idempotent: false, batch, version: 2,
      requisition_ids: [REQUISITION_ID], workflow_state: workflowState,
    });
    expect(calls).toEqual([{
      name: "submit_supplier_purchase_batch_with_workflow",
      params: {
        p_batch_id: BATCH_ID, p_tenant_id: TENANT_ID, p_expected_version: 1,
        p_actor_user_id: USER_ID, p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "workflow-submit-1",
      },
    }]);
  });

  test("maps stable workflow errors and rejects malformed envelopes", async () => {
    const { SupplierPurchaseBatchWorkflowRepository } = await import(
      "./supplier-purchase-batch-workflow"
    );
    const missing = new SupplierPurchaseBatchWorkflowRepository(() => ({
      async rpc() {
        return { data: null,
          error: { message: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING" } };
      },
    }));
    await expect(missing.submit(context)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING",
    });

    const noApprover = new SupplierPurchaseBatchWorkflowRepository(() => ({
      async rpc() {
        return { data: null,
          error: { message: "SUPPLIER_PURCHASE_BATCH_NO_APPROVER" } };
      },
    }));
    await expect(noApprover.submit(context)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_NO_APPROVER",
    });

    const malformed = new SupplierPurchaseBatchWorkflowRepository(() => ({
      async rpc() {
        return { data: { status: "submitted", idempotent: false, batch,
          version: 2, requisition_ids: [REQUISITION_ID] }, error: null };
      },
    }));
    await expect(malformed.submit(context)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });
});
