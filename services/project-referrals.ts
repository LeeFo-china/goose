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

function calculateCommissionAmount(baseAmount: number, rateBps: number) {
  return Number(((baseAmount * rateBps) / 10000).toFixed(2));
}

class ProjectReferralService {
  async createProjectReferral(input: CreateProjectReferralInput) {
    const project = await projectRepository.findById(input.project_id);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const created = await projectReferralRepository.create(input);
    return projectReferralRepository.findById(created.id);
  }

  async updateProjectReferral(id: string, input: UpdateProjectReferralInput) {
    const existing = await projectReferralRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("项目介绍费不存在");
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

    return this.getProjectReferral(projectId);
  }

  async markReferralPaid(id: string, input: MarkProjectReferralPaidInput) {
    const existing = await projectReferralRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    if (existing.status !== "calculated") {
      throw Errors.badRequest("只有已计算的项目介绍费才能标记支付");
    }

    return projectReferralRepository.markPaid(id, input);
  }

  async getProjectReferral(projectId: string) {
    return projectReferralRepository.findByProjectId(projectId);
  }

  async listProjectReferrals(params: ProjectReferralListQueryType) {
    return projectReferralRepository.list(params);
  }

  async getProjectReferralById(id: string) {
    const data = await projectReferralRepository.findById(id);
    if (!data) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    return data;
  }
}

export const projectReferralService = new ProjectReferralService();
