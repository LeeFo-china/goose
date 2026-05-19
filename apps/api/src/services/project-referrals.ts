import { Errors } from "@/errors/error-factory";
import { externalReferrerRepository } from "@/repositories/external-referrers";
import { projectRepository } from "@/repositories/projects";
import { projectReferralRepository } from "@/repositories/project-referrals";
import type { ProjectReferralRecord } from "@/repositories/project-referrals";
import type {
  CreateProjectReferralInput,
  MarkProjectReferralPaidInput,
  ProjectReferralListQueryType,
  UpdateProjectReferralInput,
} from "@/schema/project-referrals";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";

function calculateCommissionAmount(baseAmount: number, rateBps: number) {
  return Number(((baseAmount * rateBps) / 10000).toFixed(2));
}

class ProjectReferralService {
  private serializeReferral<T extends { paid_evidence_images?: unknown } | null>(
    record: T,
  ): T {
    if (!record) {
      return record;
    }

    return {
      ...record,
      paid_evidence_images: resolveStoredFileUrlList(record.paid_evidence_images),
    };
  }

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

  private requireTenantId(authContext: AuthContext) {
    return accessPolicyService.assertTenantContext(authContext);
  }

  private async ensureReferrerInCurrentTenant(
    authContext: AuthContext,
    referrerId: string,
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const referrer = await externalReferrerRepository.findById(
      referrerId,
      tenantId,
    );
    if (!referrer) {
      throw Errors.badRequest("外部介绍人不存在或不属于当前租户");
    }

    return referrer;
  }

  async createProjectReferral(
    authContext: AuthContext,
    input: CreateProjectReferralInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    const project = await projectRepository.findById(input.project_id, tenantId);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      input.project_id,
      "project_referral.manage",
    );
    if (!canAccessProject) {
      throw Errors.forbidden();
    }

    await this.ensureReferrerInCurrentTenant(authContext, input.referrer_id);

    const created = await projectReferralRepository.create(input);
    return this.serializeReferral(await projectReferralRepository.findById(created.id));
  }

  async updateProjectReferral(
    authContext: AuthContext,
    id: string,
    input: UpdateProjectReferralInput,
  ) {
    this.requireTenantId(authContext);
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
    if (!canAccessProject) {
      throw Errors.forbidden();
    }

    if (existing.status === "paid" || existing.paid_at) {
      throw Errors.badRequest("项目介绍费已支付后不允许再修改");
    }

    if (input.referrer_id) {
      await this.ensureReferrerInCurrentTenant(authContext, input.referrer_id);
    }

    const updated = await projectReferralRepository.update(id, input);
    return this.serializeReferral(await projectReferralRepository.findById(updated.id));
  }

  async calculateOnProjectSigned(projectId: string) {
    await projectReferralRepository.recalculateByProjectId(projectId);
    return this.serializeReferral(
      await projectReferralRepository.findByProjectId(projectId),
    );
  }

  async markReferralPaid(
    authContext: AuthContext,
    id: string,
    input: MarkProjectReferralPaidInput,
  ) {
    this.ensureCurrentEmployee(authContext, input.paid_by, "project_referral.manage");
    this.requireTenantId(authContext);
    const existing = await projectReferralRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("项目介绍费不存在");
    }

    accessPolicyService.assertPermission(authContext, "project_referral.manage");
    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      existing.project_id,
      "project_referral.manage",
    );
    if (!canAccessProject) {
      throw Errors.forbidden();
    }

    if (existing.status !== "calculated") {
      throw Errors.badRequest("只有已计算的项目介绍费才能标记支付");
    }

    return this.serializeReferral(await projectReferralRepository.markPaid(id, input));
  }

  async getProjectReferral(authContext: AuthContext, projectId: string) {
    this.requireTenantId(authContext);
    accessPolicyService.assertPermission(authContext, "project_referral.read");
    const canAccessProject = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_referral.read",
    );
    if (!canAccessProject) {
      throw Errors.forbidden();
    }

    return this.serializeReferral(
      await projectReferralRepository.findByProjectId(projectId),
    );
  }

  async listProjectReferrals(
    authContext: AuthContext,
    params: ProjectReferralListQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project_referral.read",
    );
    const result = await projectReferralRepository.list(
      params,
      visibleProjectIds,
      tenantId,
    );
    return {
      ...result,
      list: (result.list as unknown as ProjectReferralRecord[]).map((item) =>
        this.serializeReferral(item)
      ),
    };
  }

  async getProjectReferralById(authContext: AuthContext, id: string) {
    this.requireTenantId(authContext);
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
    if (!canAccessProject) {
      throw Errors.forbidden();
    }

    return this.serializeReferral(data);
  }
}

export const projectReferralService = new ProjectReferralService();
