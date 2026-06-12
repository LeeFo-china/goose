import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { customerCoreRepository } from "@/repositories/customer-core";
import { projectRepository } from "@/repositories/projects";
import {
  workflowTaskRepository,
  type WorkflowTransitionLogRow,
} from "@/repositories/workflow-tasks";
import type {
  ProjectStatusTransitionInput,
  UpdateProjectInput,
} from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { customerWorkflowRuntimeService } from "@/services/customer-workflow-runtime";
import { projectMemberService } from "@/services/project-members";
import { projectWorkflowRuntimeService } from "@/services/project-workflow-runtime";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import {
  inferProjectWorkflowAction,
  listProjectWorkflowActions,
  ProjectWorkflowActionConfig,
  resolveProjectWorkflowActionTransition,
} from "@/services/workflow-business-actions";
import {
  isProjectStatus,
  type CustomerStatus,
  type ProjectStatus,
} from "@gooes/domain";

const PROJECT_START_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ProjectPauseWorkflowLog = Pick<
  WorkflowTransitionLogRow,
  "action" | "target_node_key" | "context"
>;

export function resolvePausedFromStatusFromWorkflowLogs(
  logs: ProjectPauseWorkflowLog[],
): ProjectStatus | null {
  for (const log of logs) {
    if (log.action !== "pause_project" || log.target_node_key !== "on_hold") {
      continue;
    }

    const pausedFromStatus = log.context.paused_from_status;
    if (
      typeof pausedFromStatus === "string" &&
      isProjectStatus(pausedFromStatus) &&
      pausedFromStatus !== "on_hold"
    ) {
      return pausedFromStatus;
    }
  }

  return null;
}

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
    if (status !== "started" && status !== "constructing") {
      const message = status === "invalid"
        ? "无效项目不能新增施工日志"
        : status === "on_hold"
          ? "暂停项目不能新增施工日志"
          : status === "acceptance"
            ? "竣工验收项目不能新增施工日志"
            : "当前项目状态不能新增施工日志";
      throw Errors.business(
        400,
        message,
        ErrorCodes.PROJECT_LOG_PROJECT_STATUS_BLOCKED,
      );
    }
  }

  assertCanBindProjectCamera(project: { status?: unknown }) {
    const status = this.getRequiredCurrentStatus(project.status);
    if (status === "invalid") {
      throw Errors.badRequest("无效项目不能新增摄像头");
    }
    if (status === "acceptance") {
      throw Errors.badRequest("竣工验收项目不能新增摄像头");
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
    const transition = resolveProjectWorkflowActionTransition({
      action: input.payload.action,
      fromStatus,
      pausedFromStatus,
    });
    if (!transition) {
      throw Errors.business(
        409,
        "项目状态已变化，请刷新后重试",
        ErrorCodes.PROJECT_STATUS_CONFLICT,
      );
    }

    const reason = input.payload.reason?.trim() || null;
    if (ProjectWorkflowActionConfig[input.payload.action].requiresReason && !reason) {
      throw Errors.badRequest("该状态动作必须填写原因");
    }

    const patch = { ...(input.patch ?? {}) };
    delete patch.status;
    const nextSignedAmount = input.payload.signed_amount ??
      patch.signed_amount ??
      existing.signed_amount;
    let constructionManagerEmployeeId: string | null = null;
    if (input.payload.action === "sign_contract") {
      if (nextSignedAmount == null || Number(nextSignedAmount) <= 0) {
        throw Errors.badRequest("项目签约时必须提供有效的 signed_amount");
      }
      await this.assertSignContractCustomerStatus({
        tenantId,
        project: existing,
      });
      patch.signed_amount = Number(nextSignedAmount);
    }
    if (input.payload.action === "schedule_construction") {
      const nextStartDate = input.payload.start_date;
      constructionManagerEmployeeId = input.payload
        .construction_manager_employee_id?.trim() ?? null;
      if (typeof nextStartDate !== "string" || !nextStartDate.trim()) {
        throw Errors.badRequest("项目排期开工前必须先确定开工日期");
      }
      if (!PROJECT_START_DATE_PATTERN.test(nextStartDate.trim())) {
        throw Errors.badRequest("开工日期格式必须为 YYYY-MM-DD");
      }
      if (!constructionManagerEmployeeId) {
        throw Errors.business(
          400,
          "请选择工程负责人",
          ErrorCodes.CONSTRUCTION_MANAGER_REQUIRED,
        );
      }
      await projectMemberService.assertEmployeeCanServeRole({
        projectId: input.projectId,
        employeeId: constructionManagerEmployeeId,
        roleCode: "construction_manager",
        tenantId,
        invalidError: {
          message: "所选员工不能作为工程负责人",
          code: ErrorCodes.INVALID_CONSTRUCTION_MANAGER,
        },
      });
      patch.start_date = nextStartDate.trim();
    }
    if (input.payload.action === "start_acceptance") {
      await constructionStageStatusService.assertProjectReadyForAcceptance({
        projectId: input.projectId,
        tenantId,
      });
    }

    if (input.payload.action === "schedule_construction") {
      const project = await projectRepository.updateIfStatus({
        id: input.projectId,
        tenantId,
        expectedStatus: fromStatus,
        payload: {
          ...patch,
          status: transition.toStatus,
        },
      });
      if (!project) {
        throw Errors.business(
          409,
          "项目状态已变化，请刷新后重试",
          ErrorCodes.PROJECT_STATUS_CONFLICT,
        );
      }

      await projectMemberService.setPrimaryRoleMember({
        projectId: input.projectId,
        employeeId: String(constructionManagerEmployeeId),
        roleCode: "construction_manager",
        tenantId,
        invalidError: {
          message: "所选员工不能作为工程负责人",
          code: ErrorCodes.INVALID_CONSTRUCTION_MANAGER,
        },
      });
      await projectWorkflowRuntimeService.syncStatusTransitionAndSubjectState({
        authContext: input.authContext,
        tenantId,
        projectId: input.projectId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        action: input.payload.action,
        reason,
        extraContext: {
          start_date: String(patch.start_date),
          construction_manager_employee_id: constructionManagerEmployeeId,
        },
      });
      return project;
    }

    const project = await projectRepository.updateIfStatus({
      id: input.projectId,
      tenantId,
      expectedStatus: fromStatus,
      payload: {
        ...patch,
        status: transition.toStatus,
      },
    });
    if (!project) {
      throw Errors.business(
        409,
        "项目状态已变化，请刷新后重试",
        ErrorCodes.PROJECT_STATUS_CONFLICT,
      );
    }

    await projectWorkflowRuntimeService.syncStatusTransitionAndSubjectState({
        authContext: input.authContext,
        tenantId,
        projectId: input.projectId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        action: input.payload.action,
        reason,
        extraContext: {
          ...(input.payload.action === "sign_contract"
            ? { signed_amount: nextSignedAmount }
            : {}),
        },
      });

    if (input.payload.action === "sign_contract") {
      await this.syncCustomerSignedStatus({
        tenantId,
        project: existing,
        authContext: input.authContext,
      });
    }

    return project;
  }

  async listProjectStatusActions(input: {
    authContext: AuthContext;
    projectId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const hasAccess = await accessPolicyService.canAccessProject(
      input.authContext,
      input.projectId,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const project = await projectRepository.findById(input.projectId, tenantId);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const fromStatus = this.getRequiredCurrentStatus(project.status);
    const pausedFromStatus = fromStatus === "on_hold"
      ? await this.getOptionalPausedFromStatus(input.projectId, tenantId)
      : null;

    const workflowState = await workflowSubjectsService.getState(input.authContext, {
      subjectType: "project",
      subjectId: input.projectId,
    });

    return {
      current_status: fromStatus,
      paused_from_status: pausedFromStatus,
      actions: listProjectWorkflowActions({
        fromStatus,
        pausedFromStatus,
      }),
      ...workflowState,
    };
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

    const action = inferProjectWorkflowAction({
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
      return "designing";
    }

    return value;
  }

  private async getSignContractCustomer(input: {
    tenantId: string;
    project: Record<string, unknown>;
  }) {
    const customerId = typeof input.project.customer_id === "string"
      ? input.project.customer_id
      : null;
    if (!customerId) return null;

    const customer = await customerCoreRepository.findById({
      customerId,
      tenantId: input.tenantId,
    });
    if (!customer) {
      throw Errors.badRequest("关联客户不存在");
    }
    if (customer.status !== "designing" && customer.status !== "signed") {
      throw Errors.badRequest("项目签约前，关联客户销售状态必须为设计中或已签约");
    }

    return customer;
  }

  private async assertSignContractCustomerStatus(input: {
    tenantId: string;
    project: Record<string, unknown>;
  }) {
    await this.getSignContractCustomer(input);
  }

  private async syncCustomerSignedStatus(input: {
    tenantId: string;
    project: Record<string, unknown>;
    authContext: AuthContext;
  }) {
    const customer = await this.getSignContractCustomer({
      tenantId: input.tenantId,
      project: input.project,
    });
    if (!customer || customer.status === "signed") return;

    const customerId = typeof customer.id === "string" ? customer.id : null;
    if (!customerId) return;

    const fromStatus = customer.status as CustomerStatus;
    await customerCoreRepository.updateById({
      customerId,
      tenantId: input.tenantId,
      payload: { status: "signed" },
    });

    await customerWorkflowRuntimeService.syncStatusTransition({
      authContext: input.authContext,
      tenantId: input.tenantId,
      customerId,
      fromStatus,
      toStatus: "signed",
      action: "mark_signed",
      source: "project_status",
      extraContext: {
        project_id: input.project.id,
        project_action: "sign_contract",
      },
    });
  }

  private async getOptionalPausedFromStatus(projectId: string, tenantId: string) {
    const logs = await this.listProjectWorkflowTransitionLogs(projectId, tenantId);
    return resolvePausedFromStatusFromWorkflowLogs(logs);
  }

  private async getPausedFromStatus(projectId: string, tenantId: string) {
    const pausedFromStatus = await this.getOptionalPausedFromStatus(
      projectId,
      tenantId,
    );
    if (!pausedFromStatus) {
      throw Errors.badRequest("缺少项目暂停前状态，无法恢复");
    }

    return pausedFromStatus;
  }

  private async listProjectWorkflowTransitionLogs(
    projectId: string,
    tenantId: string,
  ) {
    const state = await workflowSubjectStateService.getSubjectState({
      tenantId,
      subjectType: "project",
      subjectId: projectId,
    });
    if (!state?.instance_id) {
      return [];
    }

    const result = await workflowTaskRepository.listTransitionLogs({
      tenantId,
      instanceId: state.instance_id,
      page: 1,
      pageSize: 100,
    });

    return result.list;
  }
}
export const projectStatusService = new ProjectStatusService();
