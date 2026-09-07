import { expect, mock, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("warehouse approval card excludes project lookups and displays warehouse", async () => {
  const { WorkflowTaskCardContextService } = await import("./workflow-task-card-context");
  const listProjectSummariesByIds = mock(async () => []);
  const empty = async () => [];
  const service = new WorkflowTaskCardContextService({
    listProjectSummariesByIds,
    listSupplierPurchaseBatchSummariesByIds: async () => [{
      id: "batch-1", batch_no: "PB-20260907-00000001", project_id: null,
      destination_type: "warehouse", warehouse_id: "warehouse-1",
      warehouse: { id: "warehouse-1", name: "中心仓", status: "active" },
      total_amount: 100, item_count: 1, supplier_count: 1,
      submitted_by_employee_id: null, submitted_at: null,
    }],
    listCustomerSummariesByIds: empty, listExpenseRequestSummariesByIds: empty,
    listProjectReceivableSummaries: empty, listProjectAcceptanceSummariesByProjectIds: empty,
    listEmployeeSummariesByIds: empty,
  } as never);
  const contexts = await service.buildTaskCardContextMap({ tenantId: "tenant-1", items: [{
    task: { id: "task-1", instance_id: "instance-1", node_key: "purchase_review", title: "采购审批",
      created_at: "2026-09-07T00:00:00Z", instance: { subject_type: "supplier_purchase_batch", subject_id: "batch-1" } },
    actions: [], assignee: {},
  }] as never });
  expect(listProjectSummariesByIds).toHaveBeenCalledWith({ tenantId: "tenant-1", projectIds: [] });
  expect(contexts.get("task-1")).toMatchObject({
    subtitle: "中心仓 · PB-20260907-00000001", project: null,
    amount_text: "¥100.00", people_text: "商品 1 项 · 供应商 1 家",
    business: { destination_type: "warehouse", warehouse_id: "warehouse-1", total_amount: 100, item_count: 1, supplier_count: 1 },
  });
});

test.each([["project", "warehouse", false], ["warehouse", "project", false], ["project", "project", false], ["project", "warehouse", true]] as const)(
  "historical card protects frozen %s facts after batch moves to %s (frozen applicant: %s)", async (destination, currentDestination, hasFrozenApplicant) => {
  const { WorkflowTaskCardContextService } = await import("./workflow-task-card-context");
  const frozenId = "20000000-0000-4000-8000-000000000001";
  const empty = async () => [];
  const listProjectSummariesByIds = mock(async () => [{ id: frozenId, name: "原项目" }]);
  const listEmployeeSummariesByIds = mock(async () => [
    { id: "current-applicant", name: "新目的地申请人" }, { id: frozenId, name: "原申请人" },
  ]);
  const service = new WorkflowTaskCardContextService({
    listProjectSummariesByIds,
    listSupplierPurchaseBatchSummariesByIds: async () => [{
      id: "batch-1", batch_no: "PB-1", project_id: currentDestination === "project" ? "current-project" : null,
      destination_type: currentDestination, warehouse_id: currentDestination === "warehouse" ? "current-warehouse" : null,
      warehouse: { id: "current-warehouse", name: "新仓库" }, submitted_by_employee_id: "current-applicant",
      total_amount: 987654, item_count: 77, supplier_count: 9, submitted_at: "2030-01-01T00:00:00Z",
    }],
    listCustomerSummariesByIds: empty, listExpenseRequestSummariesByIds: empty,
    listProjectReceivableSummaries: empty, listProjectAcceptanceSummariesByProjectIds: empty,
    listEmployeeSummariesByIds,
  } as never);
  const contexts = await service.buildTaskCardContextMap({ tenantId: "tenant-1", items: [{
    task: { id: "task-1", instance_id: "instance-1", status: "completed", node_key: "purchase_review",
      instance: { subject_type: "supplier_purchase_batch", subject_id: "batch-1", context: {
        destination_type: destination, project_id: destination === "project" ? frozenId : null,
        warehouse_id: destination === "warehouse" ? frozenId : null, warehouse_name: "原仓库",
        ...(hasFrozenApplicant ? { submitted_by_employee_id: frozenId } : {}),
      } } }, actions: [], assignee: {},
  }] as never });
  expect(contexts.get("task-1")?.business).toMatchObject({ destination_type: destination,
    warehouse_id: destination === "warehouse" ? frozenId : null });
  expect(contexts.get("task-1")?.subtitle).not.toContain("新仓库");
  expect(contexts.get("task-1")).toMatchObject({
    amount_text: null, people_text: hasFrozenApplicant ? "申请人 原申请人" : null,
    applicant: hasFrozenApplicant ? { id: frozenId, name: "原申请人" } : null,
    business: { total_amount: null, item_count: null, supplier_count: null, submitted_at: null },
  });
  expect(JSON.stringify(contexts.get("task-1"))).not.toContain("2030");
  expect(JSON.stringify(contexts.get("task-1"))).not.toContain("新目的地申请人");
  expect(listEmployeeSummariesByIds).toHaveBeenCalledWith({ tenantId: "tenant-1", employeeIds: hasFrozenApplicant ? [frozenId] : [] });
  expect(listProjectSummariesByIds).toHaveBeenCalledWith({ tenantId: "tenant-1",
    projectIds: destination === "project" ? [frozenId] : [] });
});
