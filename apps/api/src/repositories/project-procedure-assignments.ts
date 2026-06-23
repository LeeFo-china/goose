import { Errors } from "@/errors/error-factory";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments/types";
import { SupabaseDB } from "@/utils/supabase";

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
}

export const projectProcedureAssignmentRepository =
  new ProjectProcedureAssignmentRepository();
