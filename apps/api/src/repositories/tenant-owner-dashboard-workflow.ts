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

const ACCEPTANCE_SELECT = [
  "id",
  "project_id",
  "stage_code",
  "status",
  "updated_at",
].join(", ");

export type TenantOwnerDashboardAcceptanceRow = {
  id: string;
  project_id: string;
  stage_code: string;
  status: string;
  updated_at: string;
};

class TenantOwnerDashboardWorkflowRepository {
  private readonly adminClient = SupabaseDB.getAdminClient();

  async listCompletionEmployees(input: {
    tenantId: string;
    employeeIds: string[];
  }): Promise<Array<{ id: string; name: string | null }>> {
    const ids = [...new Set(input.employeeIds)];
    const employees: Array<{ id: string; name: string | null }> = [];
    // Current page only; bounded batches avoid node/project-level N+1 and URL limits.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const { data, error } = await this.adminClient.from("employees")
        .select("id, name").eq("tenant_id", input.tenantId).in("id", batch).limit(batch.length);
      if (error) throw Errors.dbError("批量查询甘特图节点完成人失败", error);
      employees.push(...(data ?? []));
    }
    return employees;
  }

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

  async listLatestAcceptancesForProjects(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<TenantOwnerDashboardAcceptanceRow[]> {
    const projectIds = Array.from(new Set(input.projectIds));
    if (projectIds.length === 0) return [];

    const { data, error } = await this.adminClient
      .from("project_acceptances")
      .select(ACCEPTANCE_SELECT)
      .eq("tenant_id", input.tenantId)
      .in("project_id", projectIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(projectIds.length * 100, 10_000));

    if (error) {
      throw Errors.dbError("批量查询老板看板项目验收状态失败", error);
    }

    return (data ?? []) as unknown as TenantOwnerDashboardAcceptanceRow[];
  }
}

export const tenantOwnerDashboardWorkflowRepository =
  new TenantOwnerDashboardWorkflowRepository();
