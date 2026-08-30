import type { WorkflowTaskListResult } from "@/repositories/workflow-tasks";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { WorkflowTaskListQuery } from "@/schema/workflow-subjects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type SupplierPurchaseBatchTaskAccess = {
  employeeId: string;
  visibleProjectIds: string[] | null;
};

export async function resolveSupplierPurchaseBatchTaskAccess(
  authContext: AuthContext,
): Promise<SupplierPurchaseBatchTaskAccess | null> {
  const permissionCodes = new Set(
    authContext.permissions.map((permission) => permission.code),
  );
  if (
    !authContext.employeeId ||
    !permissionCodes.has("supplier.purchase-requisition.view") ||
    !permissionCodes.has("project.read")
  ) {
    return null;
  }

  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );
  if (visibleProjectIds?.length === 0) return null;

  return {
    employeeId: authContext.employeeId,
    visibleProjectIds,
  };
}

export async function listSupplierPurchaseBatchWorkflowTasks(input: {
  authContext: AuthContext;
  tenantId: string;
  query: WorkflowTaskListQuery;
}): Promise<WorkflowTaskListResult> {
  const { authContext, tenantId, query } = input;
  const supplierAccess = await resolveSupplierPurchaseBatchTaskAccess(
    authContext,
  );
  if (!supplierAccess) {
    return {
      list: [],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }

  return workflowTaskRepository.listAccessibleSupplierPurchaseBatchTasks({
    tenantId,
    employeeId: supplierAccess.employeeId,
    roleCodes: authContext.roleCodes,
    permissionCodes: authContext.permissions.map((permission) => permission.code),
    visibleProjectIds: supplierAccess.visibleProjectIds,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    subjectId: query.subject_id?.trim() || undefined,
  });
}
