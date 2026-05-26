import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type EmployeePersonalizationRuleStatus =
  | "draft"
  | "active"
  | "disabled";

export type EmployeePersonalizationRuleRecord = {
  id: string;
  tenant_id: string;
  scene: string;
  employee_id: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  role_code: string | null;
  priority: number;
  content_json: unknown;
  status: EmployeePersonalizationRuleStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

class EmployeePersonalizationRepository {
  async listActiveRulesForScene(input: {
    tenantId: string;
    scene: string;
  }): Promise<EmployeePersonalizationRuleRecord[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .eq("tenant_id", input.tenantId)
      .eq("scene", input.scene)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询员工个性化规则失败", error);
    }

    return (data || []) as EmployeePersonalizationRuleRecord[];
  }
}

export const employeePersonalizationRepository =
  new EmployeePersonalizationRepository();
