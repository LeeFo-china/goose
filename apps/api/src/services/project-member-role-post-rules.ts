import { projectMemberRolePostRuleRepository } from "@/repositories/project-member-role-post-rules";
import type {
  EmployeePostCode,
  ProjectCreateEmployeeScene,
  ProjectMemberRoleCode,
} from "@gooes/domain";

class ProjectMemberRolePostRuleService {
  private readonly fallbackPostCodes: Record<
    ProjectMemberRoleCode,
    EmployeePostCode[]
  > = {
    customer_owner: [
      "MARKETING_DIRECTOR",
      "SALES_MANAGER",
      "SALES_CONSULTANT",
      "TELESALES",
      "CHANNEL_MANAGER",
    ],
    sales_followup: [
      "SALES_CONSULTANT",
      "TELESALES",
      "CHANNEL_MANAGER",
      "CUSTOMER_INVITER",
    ],
    designer: ["DESIGN_DIRECTOR", "CHIEF_DESIGNER", "INTERIOR_DESIGNER"],
    supervisor: [
      "ENGINEERING_DIRECTOR",
      "PROJECT_MANAGER",
      "CONSTRUCTION_SUPER",
      "QUALITY_INSPECTOR",
    ],
    construction_manager: [
      "ENGINEERING_DIRECTOR",
      "PROJECT_MANAGER",
      "CONSTRUCTION_SUPER",
    ],
    site_manager: [
      "PROJECT_MANAGER",
      "CONSTRUCTION_SUPER",
      "HYDROPOWER_FOREMAN",
      "TILE_FOREMAN",
      "CARPENTRY_FOREMAN",
      "PAINT_FOREMAN",
    ],
    budget_manager: [
      "FINANCE_MANAGER",
      "FINANCE_ACCOUNTANT",
      "COST_ACCOUNTANT",
    ],
    material_manager: [
      "PROCUREMENT_MANAGER",
      "PROCURE_OFFICER",
      "MATERIAL_CLERK",
      "WAREHOUSE_KEEPER",
    ],
  };

  private getRoleCodeByScene(
    scene: ProjectCreateEmployeeScene,
  ): ProjectMemberRoleCode {
    if (scene === "project_designer") {
      return "designer";
    }

    if (scene === "project_construction_manager") {
      return "construction_manager";
    }

    return "supervisor";
  }

  private getFallbackPostCodes(roleCode: ProjectMemberRoleCode) {
    return this.fallbackPostCodes[roleCode];
  }

  async listCandidatePostCodesByRole(roleCode: ProjectMemberRoleCode) {
    const rules = await projectMemberRolePostRuleRepository.listByRoleCode(
      roleCode,
    );

    return rules.length > 0
      ? rules
        .filter((item) => item.enabled)
        .map((item) => item.post_code)
      : this.getFallbackPostCodes(roleCode);
  }

  async listCandidatePostCodesByScene(scene: ProjectCreateEmployeeScene) {
    return this.listCandidatePostCodesByRole(this.getRoleCodeByScene(scene));
  }
}

export const projectMemberRolePostRuleService =
  new ProjectMemberRolePostRuleService();
