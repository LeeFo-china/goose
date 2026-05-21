import { Errors } from "@/errors/error-factory";
import { projectRepository } from "@/repositories/projects";
import { projectStatusTransitionRepository } from "@/repositories/project-status-transitions";
import type {
  ProjectStatusTransitionInput,
  UpdateProjectInput,
} from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { customerStatusService } from "@/services/customer-status";
import {
  inferProjectStatusAction,
  isProjectStatus,
  ProjectStatusActionConfig,
  resolveProjectStatusTransition,
  type ProjectStatus,
  type ProjectStatusAction,
} from "@gooes/domain";

type TransitionProjectStatusInput = {
  authContext: AuthContext;
  projectId: string;
  payload: ProjectStatusTransitionInput;
  patch?: UpdateProjectInput;
  existing?: Record<string, unknown> | null;
};

class ProjectStatusService {
  assertCanCreateProjectLog(project: { status?: unknown }) {
    const status = this.getRequiredCurrentStatus(project.status);
    if (status === "invalid") {
      throw Errors.badRequest("无效项目不能新增施工日志");
    }
    if (status === "on_hold") {
      throw Errors.badRequest("暂停项目不能新增施工日志");
    }
    if (status === "completed") {
      throw Errors.badRequest("已完工项目不能新增施工日志");
    }
  }

  assertCanBindProjectCamera(project: { status?: unknown }) {
    const status = this.getRequiredCurrentStatus(project.status);
    if (status === "invalid") {
      throw Errors.badRequest("无效项目不能新增摄像头");
    }
    if (status === "completed") {
      throw Errors.badRequest("已完工项目不能新增摄像头");
    }
  }

  assertCanCreateProjectAcceptance(project: { status?: unknown }) {
    const status = this.getRequiredCurrentStatus(project.status);
    if (status !== "constructing" && status !== "acceptance") {
      throw Errors.badRequest("当前项目状态不能发起验收");
    }
  }

  async transitionProjectStatus(input: TransitionProjectStatusInput) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const hasAccess = await accessPolicyService.canAccessProject(
      input.authContext,
      input.projectId,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const existing = input.existing ??
      await projectRepository.findById(input.projectId, tenantId);
    if (!existing) {
      throw Errors.badRequest("项目不存在");
    }

    const fromStatus = this.getRequiredCurrentStatus(existing.status);
    const pausedFromStatus = input.payload.action === "resume_project"
      ? await this.getPausedFromStatus(input.projectId, tenantId)
      : null;
    const transition = resolveProjectStatusTransition({
      action: input.payload.action,
      fromStatus,
      pausedFromStatus,
    });
    if (!transition) {
      throw Errors.badRequest("当前项目状态不允许执行该动作");
    }

    const reason = input.payload.reason?.trim() || null;
    if (ProjectStatusActionConfig[input.payload.action].requiresReason && !reason) {
      throw Errors.badRequest("该状态动作必须填写原因");
    }

    const patch = { ...(input.patch ?? {}) };
    delete patch.status;
    const nextSignedAmount = input.payload.signed_amount ??
      patch.signed_amount ??
      existing.signed_amount;
    if (input.payload.action === "sign_contract") {
      if (nextSignedAmount == null || Number(nextSignedAmount) <= 0) {
        throw Errors.badRequest("项目签约时必须提供有效的 signed_amount");
      }
      patch.signed_amount = Number(nextSignedAmount);
    }

    const targetCustomerId = this.getTargetCustomerId({
      existing,
      patch,
    });
    const customerContractSync = input.payload.action === "sign_contract"
      ? await customerStatusService.buildProjectContractSync({
        authContext: input.authContext,
        customerId: targetCustomerId,
        projectId: input.projectId,
      })
      : null;

    const metadata = {
      ...input.payload.metadata,
      ...(input.payload.action === "pause_project"
        ? { paused_from_status: fromStatus }
        : {}),
      ...(input.payload.action === "resume_project"
        ? { paused_from_status: transition.toStatus }
        : {}),
    };

    const project = await projectRepository.update(input.projectId, {
      ...patch,
      status: transition.toStatus,
    }, tenantId);

    await projectStatusTransitionRepository.create({
      tenantId,
      projectId: input.projectId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      action: input.payload.action,
      operatorEmployeeId: input.authContext.employeeId ?? null,
      operatorAuthUserId: input.authContext.authUserId,
      reason,
      metadata,
    });

    if (customerContractSync && targetCustomerId) {
      await customerCoreService.transitionCustomerStatus({
        authContext: input.authContext,
        customerId: targetCustomerId,
        payload: customerContractSync.payload,
        existing: customerContractSync.existing,
        skipAccessCheck: true,
      });
    }

    return project;
  }

  buildTransitionPayloadFromStatus(input: {
    existing: Record<string, unknown>;
    nextStatus: unknown;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    signedAmount?: number | null;
  }): ProjectStatusTransitionInput | null {
    if (typeof input.nextStatus !== "string" || !isProjectStatus(input.nextStatus)) {
      throw Errors.badRequest("项目状态不能为空");
    }

    const fromStatus = this.getRequiredCurrentStatus(input.existing.status);
    if (fromStatus === input.nextStatus) {
      return null;
    }

    const action = inferProjectStatusAction({
      fromStatus,
      toStatus: input.nextStatus,
    });
    if (!action) {
      throw Errors.badRequest("当前项目状态不允许直接变更为目标状态");
    }

    return {
      action,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      signed_amount: input.signedAmount ?? undefined,
    };
  }

  private getRequiredCurrentStatus(value: unknown): ProjectStatus {
    if (typeof value !== "string" || !isProjectStatus(value)) {
      return "lead";
    }

    return value;
  }

  private getTargetCustomerId(input: {
    existing: Record<string, unknown>;
    patch: Record<string, unknown>;
  }) {
    if (typeof input.patch.customer_id === "string") {
      return input.patch.customer_id;
    }

    if (input.patch.customer_id === null) {
      return null;
    }

    return typeof input.existing.customer_id === "string"
      ? input.existing.customer_id
      : null;
  }

  private async getPausedFromStatus(projectId: string, tenantId: string) {
    const latestPause = await projectStatusTransitionRepository.findLatestPause(
      projectId,
      tenantId,
    );
    const pausedFromStatus = latestPause?.metadata?.paused_from_status;
    if (
      typeof pausedFromStatus !== "string" ||
      !isProjectStatus(pausedFromStatus) ||
      pausedFromStatus === "on_hold"
    ) {
      throw Errors.badRequest("缺少项目暂停前状态，无法恢复");
    }

    return pausedFromStatus;
  }
}

export const projectStatusService = new ProjectStatusService();
