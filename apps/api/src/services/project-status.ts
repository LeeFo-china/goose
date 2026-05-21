import { Errors } from "@/errors/error-factory";
import { projectRepository } from "@/repositories/projects";
import { projectStatusTransitionRepository } from "@/repositories/project-status-transitions";
import type {
  ProjectStatusTransitionInput,
  UpdateProjectInput,
} from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
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
