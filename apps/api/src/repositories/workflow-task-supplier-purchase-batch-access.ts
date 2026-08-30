import { Errors } from "@/errors/error-factory";
import {
  listAccessibleSupplierPurchaseBatchTasksViaDirectSql,
} from "@/repositories/workflow-task-supplier-purchase-batch-direct";
import {
  buildWorkflowTaskAssigneeScope,
} from "@/repositories/workflow-tasks-direct";
import type {
  WorkflowTaskListInput,
  WorkflowTaskListResult,
  WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

export type SupplierPurchaseBatchWorkflowTaskListInput = Omit<
  WorkflowTaskListInput,
  "subjectType" | "instanceId" | "employeeId"
> & {
  employeeId: string;
  visibleProjectIds: string[] | null;
};

type WorkflowTaskRpcRow = WorkflowTaskWithInstanceRow & {
  total_count?: number | string | bigint | null;
};

type UntypedRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const MAX_VISIBLE_PROJECT_IDS = 10_000;

export function normalizeSupplierPurchaseBatchAccess<
  T extends WorkflowTaskListInput,
>(input: T): T {
  const access = input.supplierPurchaseBatchAccess;
  if (access === undefined || access === null) return input;
  return {
    ...input,
    supplierPurchaseBatchAccess: {
      ...access,
      visibleProjectIds: normalizeVisibleProjectIds(access.visibleProjectIds),
    },
  };
}

export async function listAccessibleSupplierPurchaseBatchTasks(
  input: SupplierPurchaseBatchWorkflowTaskListInput,
): Promise<WorkflowTaskListResult> {
  const normalizedInput = {
    ...input,
    visibleProjectIds: normalizeVisibleProjectIds(input.visibleProjectIds),
  };
  const page = normalizedInput.page ?? 1;
  const pageSize = Math.min(normalizedInput.pageSize ?? 20, 100);
  if (normalizedInput.visibleProjectIds?.length === 0) {
    return emptyPage(page, pageSize);
  }

  const offset = (page - 1) * pageSize;
  const directSql = getDirectPostgresSql();
  if (directSql) {
    try {
      return await listAccessibleSupplierPurchaseBatchTasksViaDirectSql({
        input: normalizedInput,
        page,
        pageSize,
        offset,
        sql: directSql,
      });
    } catch {
      // Fall through to the equally scoped service-role RPC. Keep direct SQL
      // eligible for the next request after a transient connection failure.
    }
  }

  const scope = buildWorkflowTaskAssigneeScope(normalizedInput);
  const { data, error } = await rpcClient().rpc(
    "list_accessible_supplier_purchase_batch_workflow_tasks",
    {
      p_tenant_id: normalizedInput.tenantId,
      p_employee_id: scope.employeeId,
      p_role_codes: scope.roleCodes,
      p_permission_codes: scope.permissionCodes,
      p_visible_project_ids: normalizedInput.visibleProjectIds,
      p_status: normalizedInput.status ?? "pending",
      p_subject_id: normalizedInput.subjectId ?? null,
      p_page: page,
      p_page_size: pageSize,
    },
  );
  if (error) throw Errors.dbError("查询采购批次流程待办失败", error);
  return toTaskPage(data, page, pageSize);
}

export async function listAccessibleTasksWithSupplierScopeViaRpc(input: {
  taskInput: WorkflowTaskListInput;
  page: number;
  pageSize: number;
}): Promise<WorkflowTaskListResult> {
  const { taskInput, page, pageSize } = input;
  const scope = buildWorkflowTaskAssigneeScope(taskInput);
  const supplierAccess = taskInput.supplierPurchaseBatchAccess;
  const { data, error } = await rpcClient().rpc(
    "list_accessible_workflow_tasks_with_supplier_scope",
    {
      p_tenant_id: taskInput.tenantId,
      p_employee_id: scope.employeeId ?? null,
      p_role_codes: scope.roleCodes,
      p_permission_codes: scope.permissionCodes,
      p_status: taskInput.status ?? "pending",
      p_subject_type: taskInput.subjectType ?? null,
      p_subject_id: taskInput.subjectId ?? null,
      p_instance_id: taskInput.instanceId ?? null,
      p_supplier_access_allowed: supplierAccess !== null,
      p_supplier_employee_id: supplierAccess?.employeeId ?? null,
      p_supplier_visible_project_ids: supplierAccess?.visibleProjectIds ?? null,
      p_page: page,
      p_page_size: pageSize,
    },
  );
  if (error) throw Errors.dbError("查询流程待办失败", error);
  return toTaskPage(data, page, pageSize);
}

function rpcClient(): UntypedRpcClient {
  return SupabaseDB.getAdminClient() as unknown as UntypedRpcClient;
}

function toTaskPage(
  data: unknown,
  page: number,
  pageSize: number,
): WorkflowTaskListResult {
  const rows = (data ?? []) as WorkflowTaskRpcRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    list: rows
      .filter((row) => Boolean(row.id))
      .map(({ total_count: _totalCount, ...task }) => task),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

function normalizeVisibleProjectIds(ids: string[] | null): string[] | null {
  if (ids === null) return null;
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length > MAX_VISIBLE_PROJECT_IDS) {
    throw Errors.badRequest("可见项目数量不能超过 10000 个");
  }
  return uniqueIds;
}

function emptyPage(page: number, pageSize: number): WorkflowTaskListResult {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}
