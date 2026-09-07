import { expect, mock, test } from "bun:test";
import type { AuthContext } from "./authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const id = "20000000-0000-4000-8000-000000000001";
const readState = mock(async () => ({ subjectState: null, runtimeInstance: null }));
const readTimeline = mock(async () => null);
let frozenContext: Record<string, unknown> = { destination_type: "project", project_id: id, warehouse_id: null };
let currentDestination = "warehouse";
mock.module("@/repositories/permissions", () => ({
  permissionRepository: { findProjectTenantById: async () => ({ id, tenant_id: id }) },
}));
mock.module("@/repositories/supplier-purchase-batch-workflow-review-lookup", () => ({
  supplierPurchaseBatchWorkflowReviewLookupRepository: { listInstancesById: async () => [{
    id, tenant_id: id, subject_type: "supplier_purchase_batch", subject_id: id, context: frozenContext,
  }] },
}));
mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: { getSubjectStateWithRuntime: readState, getSubjectState: readTimeline },
}));
mock.module("@/repositories/tenant-suppliers", () => ({
  tenantSuppliersRepository: { getSettings: async () => ({ tenant_id: id, module_enabled: true }) },
}));
mock.module("@/repositories/supplier-purchase-batch-access", () => ({
  SupplierPurchaseBatchAccessRepository: class {
    async findBatchAccessContext() {
      return { tenant_id: id, destination_type: currentDestination, project_id: currentDestination === "project" ? id : null,
        warehouse_id: currentDestination === "warehouse" ? id : null, submitted_by_employee_id: null };
    }
  },
}));
const params = { subjectType: "supplier_purchase_batch" as const, subjectId: id };
const auth = (codes: string[]) => ({ tenantId: id, authUserId: id, employeeId: id,
  permissions: codes.map((code) => ({ code, scope: "all" as const })), roleCodes: [],
} as unknown as AuthContext);

test("direct warehouse workflow state and timeline require procurement view and warehouse view", async () => {
  const { workflowSubjectsService } = await import("./workflow-subjects");
  for (const permissions of [[], ["inventory.warehouse.view"], ["supplier.purchase-requisition.view"], ["supplier.purchase-requisition.view", "project.read"]]) {
    await expect(workflowSubjectsService.getState(auth(permissions), params)).rejects.toMatchObject({ statusCode: 403 });
    await expect(workflowSubjectsService.listTimeline(auth(permissions), params, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(readState).not.toHaveBeenCalled();
  expect(readTimeline).not.toHaveBeenCalled();
  const reader = auth(["supplier.purchase-requisition.view", "inventory.warehouse.view"]);
  await workflowSubjectsService.getState(reader, params);
  await workflowSubjectsService.listTimeline(reader, params, { page: 1, pageSize: 20 });
  expect(readState).toHaveBeenCalledTimes(1);
  expect(readTimeline).toHaveBeenCalledTimes(1);
  expect(await workflowSubjectsService.loadAccessibleActions(reader, params)).toEqual([]);
});

test("current warehouse access cannot expose a previous project instance state or timeline", async () => {
  const { workflowSubjectsService } = await import("./workflow-subjects");
  readState.mockImplementation(async () => ({ subjectState: { instance_id: id }, runtimeInstance: null }) as never);
  readTimeline.mockImplementation(async () => ({ instance_id: id }) as never);
  const reader = auth(["supplier.purchase-requisition.view", "inventory.warehouse.view"]);
  await expect(workflowSubjectsService.getState(reader, params)).rejects.toMatchObject({ statusCode: 403 });
  await expect(workflowSubjectsService.listTimeline(reader, params, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
});

test("current project access cannot expose a previous warehouse instance state or timeline", async () => {
  const { workflowSubjectsService } = await import("./workflow-subjects");
  currentDestination = "project";
  frozenContext = { destination_type: "warehouse", project_id: null, warehouse_id: id };
  readState.mockImplementation(async () => ({ subjectState: { instance_id: id }, runtimeInstance: null }) as never);
  readTimeline.mockImplementation(async () => ({ instance_id: id }) as never);
  const reader = auth(["supplier.purchase-requisition.view", "project.read"]);
  await expect(workflowSubjectsService.getState(reader, params)).rejects.toMatchObject({ statusCode: 403 });
  await expect(workflowSubjectsService.listTimeline(reader, params, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
});
