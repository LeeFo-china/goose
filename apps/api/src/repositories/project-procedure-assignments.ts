import { Errors } from "@/errors/error-factory";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments/types";
import { SupabaseDB } from "@/utils/supabase";

type CandidateEmployeeRow = {
  id: string;
  name: string | null;
  avatar: string | null;
  status: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  tenant_department?: {
    id: string;
    alias_name: string | null;
    code: string | null;
  } | null;
  post?: {
    name: string | null;
    code: string | null;
  } | null;
};

type CandidateEmployeeListResult = {
  list: CandidateEmployeeRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ProcedureAssignmentOverlapRow = Pick<
  ProcedureAssignmentRow,
  | "id"
  | "project_id"
  | "node_key"
  | "stage_code"
  | "assignee_employee_id"
  | "planned_start_date"
  | "planned_duration_days"
  | "planned_end_date"
  | "status"
> & {
  project?: {
    id: string;
    name: string | null;
  } | null;
};

const ASSIGNMENT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "workflow_instance_id",
  "workflow_instance_node_id",
  "node_key",
  "stage_code",
  "assignee_employee_id",
  "planned_start_date",
  "planned_duration_days",
  "planned_end_date",
  "status",
  "started_by_employee_id",
  "started_at",
  "completed_by_employee_id",
  "completed_at",
  "adjusted_by_employee_id",
  "adjusted_at",
  "adjust_reason",
  "created_at",
  "updated_at",
  "assignee_employee:employees!project_procedure_assignments_assignee_employee_id_fkey(id, name, avatar)",
].join(", ");

const CANDIDATE_EMPLOYEE_SELECT = [
  "id",
  "name",
  "avatar",
  "status",
  "tenant_department_id",
  "post_id",
  "tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code)",
  "post:posts!employees_post_id_fkey(name, code)",
].join(", ");

const OVERLAP_ASSIGNMENT_SELECT = [
  "id",
  "project_id",
  "node_key",
  "stage_code",
  "assignee_employee_id",
  "planned_start_date",
  "planned_duration_days",
  "planned_end_date",
  "status",
  "project:projects!project_procedure_assignments_project_id_fkey(id, name)",
].join(", ");

class ProjectProcedureAssignmentRepository {
  async findActiveByNode(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    nodeKey: string;
  }): Promise<ProcedureAssignmentRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("workflow_instance_id", input.workflowInstanceId)
      .eq("node_key", input.nodeKey)
      .in("status", ["planned", "in_progress"])
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询工序派工失败", error);
    }

    return data as unknown as ProcedureAssignmentRow | null;
  }

  async findActiveByProjectStage(input: {
    tenantId: string;
    projectId: string;
    stageCode: string;
  }): Promise<ProcedureAssignmentRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("stage_code", input.stageCode)
      .in("status", ["planned", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询工序派工失败", error);
    }

    return data as unknown as ProcedureAssignmentRow | null;
  }

  async listActiveForProject(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
  }): Promise<ProcedureAssignmentRow[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("workflow_instance_id", input.workflowInstanceId)
      .in("status", ["planned", "in_progress", "completed"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      throw Errors.dbError("查询项目工序派工失败", error);
    }

    return (data ?? []) as unknown as ProcedureAssignmentRow[];
  }

  async hasActiveProjectAssignmentForEmployee(input: {
    tenantId: string;
    projectId: string;
    employeeId: string;
  }): Promise<boolean> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("assignee_employee_id", input.employeeId)
      .in("status", ["planned", "in_progress"])
      .limit(1);

    if (error) {
      throw Errors.dbError("查询员工项目工序派工失败", error);
    }

    return (data?.length ?? 0) > 0;
  }

  async createAssignment(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    nodeKey: string;
    stageCode: string;
    assigneeEmployeeId: string;
    plannedStartDate: string;
    plannedDurationDays: number;
    status: "planned" | "in_progress";
    operatorEmployeeId: string | null;
  }): Promise<ProcedureAssignmentRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .insert({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        workflow_instance_id: input.workflowInstanceId,
        workflow_instance_node_id: input.workflowInstanceNodeId,
        node_key: input.nodeKey,
        stage_code: input.stageCode,
        assignee_employee_id: input.assigneeEmployeeId,
        planned_start_date: input.plannedStartDate,
        planned_duration_days: input.plannedDurationDays,
        status: input.status,
        started_by_employee_id: input.operatorEmployeeId,
      })
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建工序派工失败", error);
    }

    return data as unknown as ProcedureAssignmentRow;
  }

  async updateAssignmentSchedule(input: {
    tenantId: string;
    assignmentId: string;
    assigneeEmployeeId: string;
    plannedStartDate: string;
    plannedDurationDays: number;
    status: "planned" | "in_progress";
    operatorEmployeeId: string | null;
    reason: string | null;
  }): Promise<ProcedureAssignmentRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .update({
        assignee_employee_id: input.assigneeEmployeeId,
        planned_start_date: input.plannedStartDate,
        planned_duration_days: input.plannedDurationDays,
        status: input.status,
        adjusted_by_employee_id: input.operatorEmployeeId,
        adjusted_at: new Date().toISOString(),
        adjust_reason: input.reason,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.assignmentId)
      .in("status", ["planned", "in_progress"])
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("调整工序派工失败", error);
    }

    return data as unknown as ProcedureAssignmentRow;
  }

  async markAssignmentCompleted(input: {
    tenantId: string;
    assignmentId: string;
    operatorEmployeeId: string | null;
  }): Promise<ProcedureAssignmentRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .update({
        status: "completed",
        completed_by_employee_id: input.operatorEmployeeId,
        completed_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.assignmentId)
      .in("status", ["planned", "in_progress"])
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("完成工序派工失败", error);
    }

    return data as unknown as ProcedureAssignmentRow;
  }

  async listTenantDepartmentIdsByCodes(input: {
    tenantId: string;
    departmentCodes: string[];
  }): Promise<string[]> {
    if (input.departmentCodes.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .in("code", input.departmentCodes)
      .limit(100);

    if (error) {
      throw Errors.dbError("查询工序候选部门失败", error);
    }

    return (data ?? [])
      .map((row) => typeof row.id === "string" ? row.id : null)
      .filter((id): id is string => Boolean(id));
  }

  async listCandidateEmployees(input: {
    tenantId: string;
    tenantDepartmentIds?: string[];
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<CandidateEmployeeListResult> {
    const page = input.page;
    const pageSize = Math.min(input.pageSize, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let request = SupabaseDB.getAdminClient()
      .from("employees")
      .select(CANDIDATE_EMPLOYEE_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("status", "active");

    if (input.tenantDepartmentIds) {
      request = input.tenantDepartmentIds.length > 0
        ? request.in("tenant_department_id", input.tenantDepartmentIds)
        : request.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    const keyword = input.keyword?.trim();
    if (keyword) {
      request = request.ilike("name", `%${escapeLikePattern(keyword)}%`);
    }

    const { data, error, count } = await request
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询工序候选施工人员失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data ?? []) as unknown as CandidateEmployeeRow[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async listOverlappingAssignments(input: {
    tenantId: string;
    assigneeEmployeeIds: string[];
    plannedStartDate: string;
    plannedEndDate: string;
  }): Promise<ProcedureAssignmentOverlapRow[]> {
    if (input.assigneeEmployeeIds.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_procedure_assignments")
      .select(OVERLAP_ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .in("assignee_employee_id", input.assigneeEmployeeIds)
      .in("status", ["planned", "in_progress"])
      .lte("planned_start_date", input.plannedEndDate)
      .gte("planned_end_date", input.plannedStartDate)
      .order("planned_end_date", { ascending: true })
      .limit(100);

    if (error) {
      throw Errors.dbError("查询施工人员排程冲突失败", error);
    }

    return (data ?? []) as unknown as ProcedureAssignmentOverlapRow[];
  }
}

export const projectProcedureAssignmentRepository =
  new ProjectProcedureAssignmentRepository();

function escapeLikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export type {
  CandidateEmployeeListResult,
  CandidateEmployeeRow,
  ProcedureAssignmentOverlapRow,
};
