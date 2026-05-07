import { projectMemberRolePostRuleRepository } from "@/repositories/project-member-role-post-rules";
import { Errors } from "@/errors/error-factory";
import type {
  EmployeePostCode,
  ProjectCreateEmployeeScene,
  ProjectMemberRoleCode,
} from "@gooes/domain";
import {
  PROJECT_MEMBER_ROLE_CODE_VALUES,
  PROJECT_MEMBER_ROLE_CONFIG,
  isEmployeePostCode,
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

  async getConfig() {
    const [rules, postOptions] = await Promise.all([
      projectMemberRolePostRuleRepository.listRules(),
      projectMemberRolePostRuleRepository.listActivePostOptions(),
    ]);

    return {
      roles: PROJECT_MEMBER_ROLE_CODE_VALUES.map((roleCode) => {
        const roleRules = rules.filter((rule) => rule.role_code === roleCode);
        return {
          role_code: roleCode,
          role_name: PROJECT_MEMBER_ROLE_CONFIG[roleCode].label,
          sort_order: PROJECT_MEMBER_ROLE_CONFIG[roleCode].sortOrder,
          category: PROJECT_MEMBER_ROLE_CONFIG[roleCode].category,
          selected_post_codes: roleRules
            .filter((rule) => rule.enabled)
            .sort((a, b) => a.sort - b.sort)
            .map((rule) => rule.post_code),
          rules: roleRules,
        };
      }),
      post_options: postOptions,
    };
  }

  async updateRolePostCodes(
    roleCode: ProjectMemberRoleCode,
    postCodes: string[],
  ) {
    const uniquePostCodes = Array.from(new Set(postCodes));
    if (uniquePostCodes.length === 0) {
      throw Errors.badRequest("至少选择一个岗位");
    }

    const postOptions =
      await projectMemberRolePostRuleRepository.listActivePostOptions();
    const activePostCodeSet = new Set(postOptions.map((item) => item.code));
    const invalidPostCodes = uniquePostCodes.filter(
      (postCode) => !isEmployeePostCode(postCode) && !activePostCodeSet.has(postCode as EmployeePostCode),
    );
    if (invalidPostCodes.length > 0) {
      throw Errors.badRequest(`岗位编码不存在或未启用：${invalidPostCodes.join(", ")}`);
    }

    const inactivePostCodes = uniquePostCodes.filter(
      (postCode) => !activePostCodeSet.has(postCode as EmployeePostCode),
    );
    if (inactivePostCodes.length > 0) {
      throw Errors.badRequest(`岗位编码不存在或未启用：${inactivePostCodes.join(", ")}`);
    }

    await projectMemberRolePostRuleRepository.replaceRoleRules({
      roleCode,
      postCodes: uniquePostCodes as EmployeePostCode[],
    });

    return this.getConfig();
  }
}

export const projectMemberRolePostRuleService =
  new ProjectMemberRolePostRuleService();
