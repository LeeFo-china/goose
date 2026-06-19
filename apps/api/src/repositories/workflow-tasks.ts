import { Errors } from "@/errors/error-factory";
import { workflowTable } from "@/repositories/workflows/client";
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

type WorkflowTaskListInput = {
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
};

type WorkflowTaskListResult = {
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

const WORKFLOW_TASK_SELECT = [
  "id",
  "tenant_id",
  "instance_id",
  "instance_node_id",
  "definition_id",
  "version_id",
  "node_id",
  "node_key",
  "node_type",
  "title",
  "status",
  "assignee_employee_id",
  "assignee_role_code",
  "assignee_permission_code",
  "assignee_employee:employees!workflow_tasks_assignee_employee_id_fkey(id, name, avatar)",
  "due_at",
  "completed_by",
  "completed_at",
  "created_at",
  "updated_at",
  [
    "instance:workflow_instances!inner(",
    "id, subject_type, subject_id, status, current_node_key, current_node_snapshot",
    ")",
  ].join(""),
].join(", ");

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

const SAFE_ROLE_CODE_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const SAFE_PERMISSION_CODE_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

class WorkflowTaskRepository {
  async listAccessibleTasks(
    input: WorkflowTaskListInput,
  ): Promise<WorkflowTaskListResult> {
    const assigneeFilter = this.buildAssigneeFilter(input);
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (!assigneeFilter) {
      return this.emptyList(page, pageSize);
    }

    let request = workflowTable("workflow_tasks")
      .select(WORKFLOW_TASK_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("status", input.status ?? "pending")
      .or(assigneeFilter);

    if (input.subjectType) {
      request = request.eq("instance.subject_type", input.subjectType);
    }
    if (input.subjectId) {
      request = request.eq("instance.subject_id", input.subjectId);
    }
    if (input.instanceId) {
      request = request.eq("instance_id", input.instanceId);
    }

    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询流程待办失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data ?? []) as WorkflowTaskWithInstanceRow[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
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
    if (projectIds.length === 0 || !assigneeFilter) {
      return [];
    }

    const limit = Math.min(input.limit ?? projectIds.length * 100, 10_000);
    const { data, error } = await workflowTable("workflow_tasks")
      .select(WORKFLOW_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("status", "pending")
      .eq("instance.subject_type", "project")
      .in("instance.subject_id", projectIds)
      .or(assigneeFilter)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw Errors.dbError("批量查询项目流程待办失败", error);
    }

    return (data ?? []) as WorkflowTaskWithInstanceRow[];
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
    if (input.employeeId) {
      filters.push(`assignee_employee_id.eq.${input.employeeId}`);
    }

    const roleCodes = Array.from(new Set(input.roleCodes ?? []))
      .filter((roleCode) => SAFE_ROLE_CODE_PATTERN.test(roleCode));
    if (roleCodes.length > 0) {
      filters.push(
        `and(assignee_employee_id.is.null,assignee_role_code.in.(${roleCodes.join(",")}))`,
      );
    }

    const permissionCodes = Array.from(new Set(input.permissionCodes ?? []))
      .filter((permissionCode) =>
        SAFE_PERMISSION_CODE_PATTERN.test(permissionCode)
      );
    if (permissionCodes.length > 0) {
      filters.push(
        `and(assignee_employee_id.is.null,assignee_permission_code.in.(${permissionCodes.join(",")}))`,
      );
    }
    filters.push(
      "and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.is.null)",
    );

    return filters.length > 0 ? filters.join(",") : null;
  }

  private emptyList(page: number, pageSize: number): WorkflowTaskListResult {
    return {
      list: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }
}

export const workflowTaskRepository = new WorkflowTaskRepository();
