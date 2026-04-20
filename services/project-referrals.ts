import { Errors } from "@/errors/error-factory";
import { projectRepository } from "@/repositories/projects";
import { projectReferralRepository } from "@/repositories/project-referrals";
import type {
  CreateProjectReferralInput,
  MarkProjectReferralPaidInput,
  ProjectReferralListQueryType,
  UpdateProjectReferralInput,
} from "@/schema/project-referrals";
import { SupabaseDB } from "@/utils/supabase/index";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";

function calculateCommissionAmount(baseAmount: number, rateBps: number) {
  return Number(((baseAmount * rateBps) / 10000).toFixed(2));
}

class ProjectReferralService {
  private ensureCurrentEmployee(
    authContext: AuthContext,
    employeeId: string,
    permissionCode: "project_referral.manage",
  ) {
    const scope = accessPolicyService.assertPermission(authContext, permissionCode);
    if (scope === "all") {
      return;
    }

    if (!authContext.employeeId || authContext.employeeId !== employeeId) {
      throw Errors.forbidden();
    }
  }

  async createProjectReferral(
    authContext: AuthContext,
    input: CreateProjectReferralInput,
  ) {
    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    const project = await projectRepository.findById(input.project_id);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      input.project_id,
      "project_referral.manage",
    );
    if (!canAccessProject && authContext.systemRole !== "admin") {
      throw Errors.forbidden();
    }

    const created = await projectReferralRepository.create(input);
    return projectReferralRepository.findById(created.id);
  }

  async updateProjectReferral(
    authContext: AuthContext,
    id: string,
    input: UpdateProjectReferralInput,
  ) {
    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    const existing = await projectReferralRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      existing.project_id,
      "project_referral.manage",
    );
    if (!canAccessProject && authContext.systemRole !== "admin") {
      throw Errors.forbidden();
    }

    if (existing.status === "paid" || existing.paid_at) {
      throw Errors.badRequest("项目介绍费已支付后不允许再修改");
    }

    const updated = await projectReferralRepository.update(id, input);
    return projectReferralRepository.findById(updated.id);
  }

  async calculateOnProjectSigned(projectId: string) {
    const { error } = await SupabaseDB.getAdminClient().rpc(
      "recalculate_project_referral",
      {
        p_project_id: projectId,
      },
    );

    if (error) {
      throw Errors.dbError("计算项目介绍费失败", error);
    }

    return projectReferralRepository.findByProjectId(projectId);
  }

  async markReferralPaid(
    authContext: AuthContext,
    id: string,
    input: MarkProjectReferralPaidInput,
  ) {
    this.ensureCurrentEmployee(authContext, input.paid_by, "project_referral.manage");
    const existing = await projectReferralRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    accessPolicyService.assertPermission(authContext, "project_referral.manage");

    if (existing.status !== "calculated") {
      throw Errors.badRequest("只有已计算的项目介绍费才能标记支付");
    }

    return projectReferralRepository.markPaid(id, input);
  }

  async getProjectReferral(authContext: AuthContext, projectId: string) {
    accessPolicyService.assertPermission(authContext, "project_referral.read");
    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_referral.read",
    );
    if (!canAccessProject && authContext.systemRole !== "admin") {
      throw Errors.forbidden();
    }

    return projectReferralRepository.findByProjectId(projectId);
  }

  async listProjectReferrals(
    authContext: AuthContext,
    params: ProjectReferralListQueryType,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project_referral.read",
    );
    return projectReferralRepository.list(params, visibleProjectIds);
  }

  async getProjectReferralById(authContext: AuthContext, id: string) {
    const data = await projectReferralRepository.findById(id);
    if (!data) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    accessPolicyService.assertPermission(authContext, "project_referral.read");
    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      data.project_id,
      "project_referral.read",
    );
    if (!canAccessProject && authContext.systemRole !== "admin") {
      throw Errors.forbidden();
    }

    return data;
  }
}

export const projectReferralService = new ProjectReferralService();
