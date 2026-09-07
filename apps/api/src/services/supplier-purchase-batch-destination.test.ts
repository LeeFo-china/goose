import { expect, mock, test } from "bun:test";
import type { AuthContext } from "./authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const id = "20000000-0000-4000-8000-000000000001";
const warehouseId = "20000000-0000-4000-8000-000000000002";
const scope = { tenantId: id, authUserId: id, employeeId: id };
const batch = { id, tenant_id: id, destination_type: "warehouse", warehouse_id: warehouseId, project_id: null, status: "draft", created_by_employee_id: id };
const draft = { destination_type: "warehouse", warehouse_id: warehouseId, project_id: null, expected_version: 0, reason: "补货", items: [{ supplier_sku_id: id, cost_category_id: id, quantity: "1" }] };

async function fixture(enabled = true, warehouseStatus: string | null = "active") {
  const { SupplierPurchaseBatchesService } = await import("./supplier-purchase-batches");
  const access = {
    requireManage: mock(async () => scope), requireView: mock(async () => scope),
    requireActorScope: mock(async () => scope), requireApprove: mock(async () => scope),
    assertProjectRead: mock(async () => {}), assertProjectUpdate: mock(async () => {}), getVisibleProjectIds: mock(async () => []),
    getVisibleProjectUpdateIds: mock(async () => []),
  };
  const repository = {
    findBatch: mock(async () => batch), saveDraft: mock(async (input: unknown) => input),
    listCatalog: mock(async (input: unknown) => input), submit: mock(async () => ({})),
  };
  const destination = {
    getSettings: mock(async () => ({ warehouse_procurement_enabled: enabled })),
    findWarehouse: mock(async () => warehouseStatus ? { id: warehouseId, tenant_id: id, status: warehouseStatus } : null),
  };
  const workflowRuntime = { isEnabled: mock(async () => true), submit: mock(async () => ({})) };
  const service = new SupplierPurchaseBatchesService({ access, repository, destination,
    workflowRuntime,
  } as never);
  const auth = { ...scope, permissions: [{ code: "inventory.warehouse.manage", scope: "all" }] } as unknown as AuthContext;
  return { service, auth, access, repository, destination, workflowRuntime };
}

test("warehouse save/catalog/submit use active warehouse without any project update scope", async () => {
  const f = await fixture();
  await f.service.saveDraft(f.auth, id, draft as never, "save");
  await f.service.listCatalog(f.auth, { destinationType: "warehouse", warehouseId, page: 1, pageSize: 20 } as never);
  await f.service.submit(f.auth, id, { expected_version: 1 }, "submit");
  expect(f.access.assertProjectUpdate).not.toHaveBeenCalled();
  expect(f.destination.findWarehouse).toHaveBeenCalledWith(id, warehouseId);
  expect(f.repository.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ destination_type: "warehouse", project_id: null, warehouse_id: warehouseId }));
});

test("warehouse write permission cannot be bypassed by injected project access", async () => {
  const f = await fixture();
  await expect(f.service.saveDraft({ ...f.auth, permissions: [] }, id, draft as never, "key"))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.saveDraft).not.toHaveBeenCalled();
});

test("warehouse from another tenant is rejected before draft write", async () => {
  const f = await fixture();
  f.destination.findWarehouse.mockImplementation(async () => ({ id: warehouseId, tenant_id: warehouseId, status: "active" }));
  await expect(f.service.saveDraft(f.auth, id, draft as never, "key")).rejects.toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });
  expect(f.repository.saveDraft).not.toHaveBeenCalled();
});

test("warehouse manager without warehouse view cannot read batch detail", async () => {
  const f = await fixture();
  await expect(f.service.getBatch(f.auth, id)).rejects.toMatchObject({ code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND" });
});

test("warehouse submit never falls back to legacy submission when workflow gate closes", async () => {
  const f = await fixture();
  f.workflowRuntime.isEnabled.mockImplementation(async () => false);
  await expect(f.service.submit(f.auth, id, { expected_version: 1 }, "submit"))
    .rejects.toMatchObject({ code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_DISABLED" });
  expect(f.repository.submit).not.toHaveBeenCalled();
  expect(f.workflowRuntime.submit).not.toHaveBeenCalled();
});

test("real access services do not require project permissions for warehouse scopes", async () => {
  const { SupplierPurchaseBatchAccessService } = await import("./supplier-purchase-batch-access");
  const { SupplierPurchaseOrderAccessService } = await import("./supplier-purchase-order-access");
  const { SupplierPurchaseRequisitionAccessService } = await import("./supplier-purchase-requisition-access");
  const f = await fixture();
  const auth = { ...f.auth, permissions: [
    { code: "inventory.warehouse.manage", scope: "all" as const },
    { code: "inventory.warehouse.view", scope: "all" as const },
  ] };
  const batchAccess = new SupplierPurchaseBatchAccessService();
  expect(await batchAccess.getVisibleProjectIds(auth)).toEqual([]);
  expect(await batchAccess.getVisibleProjectUpdateIds(auth)).toEqual([]);
  expect(await new SupplierPurchaseOrderAccessService().getVisibleProjectIds(auth)).toEqual([]);
  expect(await new SupplierPurchaseRequisitionAccessService().getVisibleProjectIds(auth)).toEqual([]);
});

test("warehouse review refuses legacy approval when workflow is disabled", async () => {
  const f = await fixture();
  f.workflowRuntime.isEnabled.mockImplementation(async () => false);
  f.auth.permissions.push({ code: "inventory.warehouse.view", scope: "all" });
  await expect(f.service.review(f.auth, id, { action: "approve", expected_version: 1 }, "review"))
    .rejects.toMatchObject({ code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_DISABLED" });
});

test("warehouse approval requires warehouse read and never project scope", async () => {
  const { WorkflowTaskSupplierPurchaseBatchBridge } = await import("./workflow-task-supplier-purchase-batch-bridge");
  const completeTask = mock(async () => ({ status: "ordered" }));
  const canAccessProject = mock(async () => true);
  const bridge = new WorkflowTaskSupplierPurchaseBatchBridge({
    lookupRepository: { listReviewEvents: async () => [] },
    repository: { completeTask }, batchesRepository: { findBatchAccessContext: async () => ({ ...batch, submitted_by_employee_id: null }) },
    accessPolicy: { hasPermission: (auth: AuthContext, code: string) => auth.permissions.some((permission) => permission.code === code), canAccessProject },
  } as never);
  const f = await fixture();
  const context = { ...f.auth, permissions: ["supplier.purchase-requisition.view", "supplier.purchase-requisition.approve"].map((code) => ({ code, scope: "all" as const })) };
  const command = { authContext: context, task: { id, tenant_id: id, node_key: "purchase_review", instance: { subject_id: id } },
    action: "approve", reason: null, output: {}, idempotencyKey: "warehouse-approve" };
  await expect(bridge.complete(command)).rejects.toMatchObject({ statusCode: 403 });
  context.permissions.push({ code: "inventory.warehouse.view", scope: "all" });
  await expect(bridge.complete(command)).rejects.toMatchObject({ statusCode: 403 });
  context.permissions.push({ code: "inventory.warehouse.manage", scope: "all" });
  await bridge.complete(command);
  expect(canAccessProject).not.toHaveBeenCalled();
  expect(completeTask).toHaveBeenCalledTimes(1);
});

test("warehouse review action needs warehouse manage in addition to approve and view", async () => {
  const { deriveSupplierPurchaseBatchActions } = await import("./supplier-purchase-batch-access");
  const input = { destinationType: "warehouse" as const, status: "pending_approval" as const,
    createdByEmployeeId: warehouseId, submittedByEmployeeId: warehouseId, actorEmployeeId: id,
    permissions: ["supplier.purchase-requisition.approve", "inventory.warehouse.view"],
    canReadProject: false, canUpdateProject: false };
  expect(deriveSupplierPurchaseBatchActions(input).can_review).toBe(false);
  expect(deriveSupplierPurchaseBatchActions({ ...input, permissions: [...input.permissions, "inventory.warehouse.manage"] }).can_review).toBe(true);
});

test("warehouse task projection removes execute actions from readers", async () => {
  const { filterWarehouseProcurementActions } = await import("./procurement-destination-access");
  const f = await fixture();
  const actions = [{ action: "approve" }];
  expect(filterWarehouseProcurementActions({ ...f.auth, permissions: [] }, "warehouse", actions)).toEqual([]);
  expect(filterWarehouseProcurementActions(f.auth, "warehouse", actions)).toEqual(actions);
});

test.each([[false, "active", "WAREHOUSE_PROCUREMENT_NOT_ENABLED"], [true, "inactive", "WAREHOUSE_INACTIVE"], [true, null, "WAREHOUSE_NOT_FOUND"]] as const)(
  "warehouse write gate enabled=%s status=%s", async (enabled, status, code) => {
    const f = await fixture(enabled, status);
    await expect(f.service.saveDraft(f.auth, id, draft as never, "key")).rejects.toMatchObject({ code });
    expect(f.repository.saveDraft).not.toHaveBeenCalled();
  },
);
