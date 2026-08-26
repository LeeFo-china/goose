import { Errors } from "@/errors/error-factory";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";
import { SupabaseDB } from "@/utils/supabase/index";

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

class TenantOwnerDashboardWorkflowRepository {
  private readonly adminClient = SupabaseDB.getAdminClient();

  async listProcedureAssignmentsForRuntimeIds(input: {
    tenantId: string;
    runtimeInstanceIds: string[];
  }): Promise<ProcedureAssignmentRow[]> {
    const runtimeInstanceIds = Array.from(new Set(input.runtimeInstanceIds));
    if (runtimeInstanceIds.length === 0) return [];

    const { data, error } = await this.adminClient
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .in("workflow_instance_id", runtimeInstanceIds)
      .in("status", ["planned", "in_progress", "completed"])
      .order("created_at", { ascending: true })
      .limit(Math.min(runtimeInstanceIds.length * 100, 10_000));

    if (error) {
      throw Errors.dbError("批量查询老板看板工序派工失败", error);
    }

    return (data ?? []) as unknown as ProcedureAssignmentRow[];
  }
}

export const tenantOwnerDashboardWorkflowRepository =
  new TenantOwnerDashboardWorkflowRepository();
