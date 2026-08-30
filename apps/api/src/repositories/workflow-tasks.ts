import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
  buildWorkflowTaskAssigneeScope,
  listAccessiblePendingByProjectIdsViaDirectSql,
  listAccessiblePendingBySubjectIdsViaDirectSql,
  listAccessibleTasksViaDirectSql,
} from "@/repositories/workflow-tasks-direct";
import {
  listAccessibleSupplierPurchaseBatchTasks,
  listAccessibleTasksWithSupplierScopeViaRpc,
  type SupplierPurchaseBatchWorkflowTaskListInput,
} from "@/repositories/workflow-task-supplier-purchase-batch-access";
import { WORKFLOW_TASK_SELECT } from "@/repositories/workflow-task-select";
import { workflowTable } from "@/repositories/workflows/client";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import type {
  JsonObject,
  WorkflowInstanceRow,
  WorkflowTaskRow,
} from "@/repositories/workflows";
import type {
  WorkflowSubjectType,
  WorkflowTaskStatus,
} from "@gooes/domain";

type WorkflowTaskInstanceSummary = Pick<
  WorkflowInstanceRow,
  | "id"
  | "subject_type"
  | "subject_id"
  | "status"
  | "current_node_key"
  | "current_node_snapshot"
>;

export type WorkflowTaskWithInstanceRow = WorkflowTaskRow & {
  instance: WorkflowTaskInstanceSummary | null;
  assignee_employee?: {
    id: string;
    name: string | null;
    avatar: string | null;
  } | null;
};

export type WorkflowTaskActionRow = Pick<WorkflowTaskWithInstanceRow,
  "id" | "instance_id" | "instance_node_id" | "node_id" | "node_key" |
  "node_type" | "title" | "status" | "assignee_employee_id" |
  "assignee_role_code" | "assignee_permission_code" | "created_at" |
  "instance">;

export type WorkflowTransitionLogRow = {
  id: string;
  tenant_id: string;
  instance_id: string;
  definition_id: string;
  version_id: string;
  source_node_id: string | null;
  source_node_key: string | null;
  target_node_id: string | null;
  target_node_key: string | null;
  edge_id: string | null;
  action: string;
  context: JsonObject;
  actor_employee_id: string | null;
  created_at: string;
};

export type WorkflowTaskListInput = {
  tenantId: string;
  employeeId?: string | null;
  roleCodes?: string[];
  permissionCodes?: string[];
  page?: number;
  pageSize?: number;
  status?: WorkflowTaskStatus;
  subjectType?: WorkflowSubjectType;
  subjectId?: string;
  instanceId?: string;
  supplierPurchaseBatchAccess?: {
    employeeId: string;
    visibleProjectIds: string[] | null;
  } | null;
};

export type WorkflowTaskListResult = {
  list: WorkflowTaskWithInstanceRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type WorkflowTransitionLogListInput = {
  tenantId: string;
  instanceId: string;
  page?: number;
  pageSize?: number;
};

type WorkflowTaskRpcRow = WorkflowTaskWithInstanceRow & {
  total_count?: number | string | bigint | null;
};

type WorkflowTaskActionRpcRow = WorkflowTaskActionRow & {
  total_count?: number | string | bigint | null;
};

type UntypedRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const WORKFLOW_TRANSITION_LOG_SELECT = [
  "id",
  "tenant_id",
  "instance_id",
  "definition_id",
  "version_id",
  "source_node_id",
  "source_node_key",
  "target_node_id",
  "target_node_key",
  "edge_id",
  "action",
  "context",
  "actor_employee_id",
  "created_at",
].join(", ");

class WorkflowTaskRepository {
  async listAccessibleTasks(
    input: WorkflowTaskListInput,
  ): Promise<WorkflowTaskListResult> {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;

    const directSql = getDirectPostgresSql();
    if (directSql) {
      try {
        return await listAccessibleTasksViaDirectSql({
          input,
          page,
          pageSize,
          offset: from,
          sql: directSql,
        });
      } catch {
        // Fall through to the RPC path. A transient direct connection failure
        // must not permanently push the process onto the PostgREST fallback.
      }
    }

    return input.supplierPurchaseBatchAccess === undefined
      ? this.listAccessibleTasksViaRpc(input, page, pageSize)
      : listAccessibleTasksWithSupplierScopeViaRpc({
        taskInput: input,
        page,
        pageSize,
      });
  }

  async listAccessibleSupplierPurchaseBatchTasks(
    input: SupplierPurchaseBatchWorkflowTaskListInput,
  ): Promise<WorkflowTaskListResult> {
    return listAccessibleSupplierPurchaseBatchTasks(input);
  }

  async findById(input: {
    tenantId: string;
    taskId: string;
  }): Promise<WorkflowTaskWithInstanceRow | null> {
    const { data, error } = await workflowTable("workflow_tasks")
      .select(WORKFLOW_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.taskId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程待办失败", error);
    }

    return data as WorkflowTaskWithInstanceRow | null;
  }

  async listPendingByInstance(input: {
    tenantId: string;
    instanceId: string;
  }): Promise<WorkflowTaskWithInstanceRow[]> {
    const { data, error } = await workflowTable("workflow_tasks")
      .select(WORKFLOW_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("instance_id", input.instanceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      throw Errors.dbError("查询流程实例待办失败", error);
    }

    return (data ?? []) as WorkflowTaskWithInstanceRow[];
  }

  async listPendingBySubjectIds(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
    limit?: number;
  }): Promise<WorkflowTaskWithInstanceRow[]> {
    const subjectIds = Array.from(new Set(input.subjectIds));
    if (subjectIds.length === 0) return [];

    const limit = Math.min(input.limit ?? subjectIds.length * 3, 300);
    const { data, error } = await workflowTable("workflow_tasks")
      .select(WORKFLOW_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("status", "pending")
      .eq("instance.subject_type", input.subjectType)
      .in("instance.subject_id", subjectIds)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw Errors.dbError("批量查询流程待办失败", error);
    }

    return (data ?? []) as WorkflowTaskWithInstanceRow[];
  }

  async listAccessiblePendingByProjectIds(input: {
    tenantId: string;
    employeeId?: string | null;
    roleCodes?: string[];
    permissionCodes?: string[];
    projectIds: string[];
    limit?: number;
  }): Promise<WorkflowTaskWithInstanceRow[]> {
    const projectIds = Array.from(new Set(input.projectIds));
    const assigneeFilter = this.buildAssigneeFilter(input);
    if (projectIds.length === 0 || !assigneeFilter) return [];

    const limit = Math.min(input.limit ?? projectIds.length * 100, 10_000);
    const directSql = getDirectPostgresSql();
    if (directSql) {
      try {
        return await listAccessiblePendingByProjectIdsViaDirectSql({
          ...input,
          projectIds,
          limit,
          sql: directSql,
        });
      } catch {
        // Fall through to the RPC path. Keep direct SQL eligible for the next
        // request so a transient failure cannot permanently enable long REST filters.
      }
    }

    return this.listAccessiblePendingByProjectIdsViaRpc({
      ...input,
      projectIds,
      limit,
    });
  }

  async listAccessiblePendingBySubjectIds(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
    employeeId?: string | null;
    roleCodes?: string[];
    permissionCodes?: string[];
    limit?: number;
  }): Promise<WorkflowTaskActionRow[]> {
    const subjectIds = Array.from(new Set(input.subjectIds)).slice(0, 100);
    if (subjectIds.length === 0) return [];
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
    const scopedInput = { ...input, subjectIds, limit };
    const directSql = getDirectPostgresSql();
    if (directSql) {
      try {
        return await listAccessiblePendingBySubjectIdsViaDirectSql({
          ...scopedInput,
          sql: directSql,
        });
      } catch {
        // Keep direct SQL eligible after a transient connection failure.
      }
    }
    return this.listAccessiblePendingBySubjectIdsViaRpc(scopedInput);
  }

  async assignPendingTask(input: {
    tenantId: string;
    instanceId: string;
    nodeKey: string;
    assigneeEmployeeId: string | null;
  }): Promise<void> {
    const { error } = await workflowTable("workflow_tasks")
      .update({
        assignee_employee_id: input.assigneeEmployeeId,
      })
      .eq("tenant_id", input.tenantId)
      .eq("instance_id", input.instanceId)
      .eq("node_key", input.nodeKey)
      .eq("status", "pending")
      .select("id")
      .limit(1);

    if (error) {
      throw Errors.dbError("更新流程待办负责人失败", error);
    }
  }

  async listTransitionLogs(input: WorkflowTransitionLogListInput) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await workflowTable("workflow_transition_logs")
      .select(WORKFLOW_TRANSITION_LOG_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("instance_id", input.instanceId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询流程时间线失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data ?? []) as WorkflowTransitionLogRow[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  private buildAssigneeFilter(input: WorkflowTaskListInput): string | null {
    const filters: string[] = [];
    const { employeeId, roleCodes, permissionCodes } =
      buildWorkflowTaskAssigneeScope(input);
    if (employeeId) {
      filters.push(`assignee_employee_id.eq.${employeeId}`);
    }

    if (roleCodes.length > 0) {
      filters.push(
        `and(assignee_employee_id.is.null,assignee_role_code.in.(${roleCodes.join(",")}),assignee_permission_code.is.null)`,
      );
    }

    if (permissionCodes.length > 0) {
      filters.push(
        `and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.in.(${permissionCodes.join(",")}))`,
      );
    }
    if (roleCodes.length > 0 && permissionCodes.length > 0) {
      filters.push(
        `and(assignee_employee_id.is.null,assignee_role_code.in.(${roleCodes.join(",")}),assignee_permission_code.in.(${permissionCodes.join(",")}))`,
      );
    }
    filters.push(
      "and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.is.null)",
    );

    return filters.length > 0 ? filters.join(",") : null;
  }

  private rpcClient(): UntypedRpcClient {
    return SupabaseDB.getAdminClient() as unknown as UntypedRpcClient;
  }

  private async listAccessibleTasksViaRpc(
    input: WorkflowTaskListInput,
    page: number,
    pageSize: number,
  ): Promise<WorkflowTaskListResult> {
    const { employeeId, roleCodes, permissionCodes } =
      buildWorkflowTaskAssigneeScope(input);
    const { data, error } = await this.rpcClient().rpc(
      "list_accessible_workflow_tasks",
      {
        p_tenant_id: input.tenantId,
        p_employee_id: employeeId ?? null,
        p_role_codes: roleCodes,
        p_permission_codes: permissionCodes,
        p_status: input.status ?? "pending",
        p_subject_type: input.subjectType ?? null,
        p_subject_id: input.subjectId ?? null,
        p_instance_id: input.instanceId ?? null,
        p_page: page,
        p_page_size: pageSize,
      },
    );

    if (error) {
      throw Errors.dbError("查询流程待办失败", error);
    }

    const rows = (data ?? []) as WorkflowTaskRpcRow[];
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      list: this.toWorkflowTaskRows(rows),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  private async listAccessiblePendingByProjectIdsViaRpc(input: {
    tenantId: string;
    employeeId?: string | null;
    roleCodes?: string[];
    permissionCodes?: string[];
    projectIds: string[];
    limit: number;
  }): Promise<WorkflowTaskWithInstanceRow[]> {
    const { employeeId, roleCodes, permissionCodes } =
      buildWorkflowTaskAssigneeScope(input);
    const { data, error } = await this.rpcClient().rpc(
      "list_accessible_project_workflow_tasks",
      {
        p_tenant_id: input.tenantId,
        p_employee_id: employeeId ?? null,
        p_role_codes: roleCodes,
        p_permission_codes: permissionCodes,
        p_project_ids: input.projectIds,
        p_limit: input.limit,
      },
    );

    if (error) {
      throw Errors.dbError("批量查询项目流程待办失败", error);
    }

    return this.toWorkflowTaskRows((data ?? []) as WorkflowTaskRpcRow[]);
  }

  private async listAccessiblePendingBySubjectIdsViaRpc(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
    employeeId?: string | null;
    roleCodes?: string[];
    permissionCodes?: string[];
    limit: number;
  }): Promise<WorkflowTaskActionRow[]> {
    const scope = buildWorkflowTaskAssigneeScope(input);
    const { data, error } = await this.rpcClient().rpc(
      "list_accessible_workflow_tasks_by_subject_ids",
      {
        p_tenant_id: input.tenantId,
        p_subject_type: input.subjectType,
        p_subject_ids: input.subjectIds,
        p_employee_id: scope.employeeId ?? null,
        p_role_codes: scope.roleCodes,
        p_permission_codes: scope.permissionCodes,
        p_limit: input.limit,
      },
    );
    if (error) throw Errors.dbError("批量查询可处理流程待办失败", error);
    return ((data ?? []) as WorkflowTaskActionRpcRow[]).map((row) => {
      const { total_count: _totalCount, ...task } = row;
      return task;
    });
  }

  private toWorkflowTaskRows(rows: WorkflowTaskRpcRow[]): WorkflowTaskWithInstanceRow[] {
    return rows.map((row) => {
      const { total_count: _totalCount, ...task } = row;
      return task;
    });
  }

}

export const workflowTaskRepository = new WorkflowTaskRepository();
