import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "b3000000-0000-4000-8000-000000000001";
const BATCH_ID = "b3000000-0000-4000-8000-000000000002";
const INSTANCE_ID = "b3000000-0000-4000-8000-000000000003";
const TASK_ID = "b3000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "b3000000-0000-4000-8000-000000000005";

describe("SupplierPurchaseBatchWorkflowReviewLookupRepository", () => {
  test("uses two bounded narrow queries to resolve the compatibility task", async () => {
    const { SupplierPurchaseBatchWorkflowReviewLookupRepository } =
      await import("./supplier-purchase-batch-workflow-review-lookup");
    const instanceQuery = query([{
      id: INSTANCE_ID,
      tenant_id: TENANT_ID,
      subject_type: "supplier_purchase_batch",
      subject_id: BATCH_ID,
      current_node_key: "purchase_review",
      context: { approval_round: 2 },
    }]);
    const taskQuery = query([{
      id: TASK_ID,
      tenant_id: TENANT_ID,
      instance_id: INSTANCE_ID,
      node_key: "purchase_review",
      status: "pending",
      assignee_employee_id: EMPLOYEE_ID,
      assignee_role_code: null,
      assignee_permission_code: null,
    }]);
    const repository = new SupplierPurchaseBatchWorkflowReviewLookupRepository(
      () => ({
        from: (table: string) => table === "workflow_instances"
          ? instanceQuery.value
          : taskQuery.value,
      }),
    );

    expect(await repository.listRunningInstances({
      tenantId: TENANT_ID,
      batchId: BATCH_ID,
    })).toHaveLength(1);
    expect(await repository.listPendingTasks({
      tenantId: TENANT_ID,
      instanceId: INSTANCE_ID,
    })).toHaveLength(1);

    expect(instanceQuery.select).toHaveBeenCalledWith(
      "id,tenant_id,subject_type,subject_id,current_node_key,context",
    );
    expect(taskQuery.select).toHaveBeenCalledWith(
      "id,tenant_id,instance_id,node_key,status,assignee_employee_id," +
        "assignee_role_code,assignee_permission_code",
    );
    expect(instanceQuery.limit).toHaveBeenCalledWith(2);
    expect(taskQuery.limit).toHaveBeenCalledWith(2);
  });

  test("wraps malformed lookup rows as database errors", async () => {
    const { SupplierPurchaseBatchWorkflowReviewLookupRepository } =
      await import("./supplier-purchase-batch-workflow-review-lookup");
    const malformed = query([{ id: "bad" }]);
    const repository = new SupplierPurchaseBatchWorkflowReviewLookupRepository(
      () => ({ from: () => malformed.value }),
    );

    await expect(repository.listRunningInstances({
      tenantId: TENANT_ID,
      batchId: BATCH_ID,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});

function query(data: unknown) {
  const select = mock(() => value);
  const eq = mock(() => value);
  const order = mock(() => value);
  const limit = mock(async () => ({ data, error: null }));
  const value = { select, eq, order, limit };
  return { value, select, eq, order, limit };
}
