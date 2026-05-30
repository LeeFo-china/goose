import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { customerCoreRepository } from "@/repositories/customer-core";
import { customerStatusTransitionRepository } from "@/repositories/customer-status-transitions";
import { projectRepository } from "@/repositories/projects";
import { projectStatusTransitionRepository } from "@/repositories/project-status-transitions";
import type {
  ProjectStatusTransitionInput,
  ProjectStatusTransitionListQuery,
  UpdateProjectInput,
} from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { projectMemberService } from "@/services/project-members";
import {
  inferProjectStatusAction,
  isProjectStatus,
  listProjectStatusActions,
  ProjectStatusActionConfig,
  resolveProjectStatusTransition,
  type CustomerStatus,
  type ProjectStatus,
  type ProjectStatusAction,
} from "@gooes/domain";

const PROJECT_START_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    const transition = resolveProjectStatusTransition({
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
      await this.assertSignContractCustomerStatus({
        tenantId,
        project: existing,
      });
      patch.signed_amount = Number(nextSignedAmount);
    }
    if (input.payload.action === "schedule_construction") {
      const nextStartDate = input.payload.start_date;
      const constructionManagerEmployeeId =
        input.payload.construction_manager_employee_id?.trim();
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

    const metadata = {
      ...input.payload.metadata,
      ...(input.payload.action === "pause_project"
        ? { paused_from_status: fromStatus }
        : {}),
      ...(input.payload.action === "resume_project"
        ? { paused_from_status: transition.toStatus }
        : {}),
    };

    if (input.payload.action === "schedule_construction") {
      return projectRepository.scheduleConstructionTransition({
        projectId: input.projectId,
        tenantId,
        expectedStatus: fromStatus,
        toStatus: transition.toStatus,
        startDate: String(patch.start_date),
        constructionManagerEmployeeId: String(
          input.payload.construction_manager_employee_id,
        ).trim(),
        operatorEmployeeId: input.authContext.employeeId ?? null,
        operatorAuthUserId: input.authContext.authUserId,
        reason,
        metadata,
      });
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

    return {
      current_status: fromStatus,
      paused_from_status: pausedFromStatus,
      actions: listProjectStatusActions({
        fromStatus,
        pausedFromStatus,
      }),
    };
  }

  async listProjectStatusTransitions(input: {
    authContext: AuthContext;
    projectId: string;
    query: ProjectStatusTransitionListQuery;
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

    const result = await projectStatusTransitionRepository.listByProject({
      projectId: input.projectId,
      tenantId,
      page: input.query.page,
      pageSize: input.query.pageSize,
      includeCount: false,
    });

    return {
      rows: result.rows,
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: result.total ?? result.rows.length,
        totalPages: result.total != null && result.total > 0
          ? Math.ceil(result.total / input.query.pageSize)
          : result.rows.length > 0
            ? input.query.page
            : 0,
      },
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

    await customerStatusTransitionRepository.create({
      tenantId: input.tenantId,
      customerId,
      fromStatus,
      toStatus: "signed",
      action: "mark_signed",
      operatorEmployeeId: input.authContext.employeeId ?? null,
      operatorAuthUserId: input.authContext.authUserId,
      reason: null,
      metadata: {
        source: "project_status",
        project_id: input.project.id,
        project_action: "sign_contract",
      },
    });
  }

  private async getOptionalPausedFromStatus(projectId: string, tenantId: string) {
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
      return null;
    }

    return pausedFromStatus;
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
