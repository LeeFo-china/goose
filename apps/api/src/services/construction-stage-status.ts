import { Errors } from "@/errors/error-factory";
import {
  projectAcceptanceRepository,
  type ProjectAcceptanceProjectRow,
  type ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";
import { projectLogRepository } from "@/repositories/project-logs";
import type { ProjectLogLatestStageRow } from "@/repositories/project-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectAcceptanceStatusConfig,
  getPreviousProjectConstructionStage,
  isProjectConstructionStageCode,
  isProjectLogStageCode,
  type ProjectConstructionStageCode,
  type ProjectConstructionStageStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";

class ConstructionStageStatusService {
  async listProjectConstructionStages(input: {
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

    const [canReadAcceptance, hasCreateAcceptancePermission] = await Promise.all([
      this.canAccessProjectByOptionalPermission(
        input.authContext,
        input.projectId,
        ["project_acceptance.read", "project_acceptance.manage"],
      ),
      this.canAccessProjectByOptionalPermission(
        input.authContext,
        input.projectId,
        ["project_acceptance.create"],
      ),
    ]);

    return this.listProjectConstructionStagesForProject({
      projectId: input.projectId,
      tenantId,
      canReadAcceptance,
      canCreateAcceptance: canReadAcceptance && hasCreateAcceptancePermission,
    });
  }

  async listProjectConstructionStagesForProject(input: {
    projectId: string;
    tenantId?: string | null;
    canReadAcceptance?: boolean;
    canCreateAcceptance?: boolean;
  }) {
    const project = await projectAcceptanceRepository.getProject(
      input.projectId,
      input.tenantId,
    );
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const stageCodes = [
      ...PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
      PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
    ];
    const [acceptanceRows, logRows, latestLogRows] = await Promise.all([
      projectAcceptanceRepository.listLatestAcceptancesByStages({
        projectId: input.projectId,
        stageCodes,
        tenantId: input.tenantId,
      }),
      projectLogRepository.listStageCodesByProject({
        projectId: input.projectId,
        tenantId: input.tenantId,
      }),
      projectLogRepository.listLatestLogsByStages({
        projectId: input.projectId,
        stageCodes,
        tenantId: input.tenantId,
      }),
    ]);
    const acceptanceMap = new Map(
      acceptanceRows.map((item) => [item.stage_code, item]),
    );
    const latestLogMap = new Map(
      latestLogRows
        .filter((item) => item.stage_code)
        .map((item) => [item.stage_code as string, item]),
    );
    const logStageSet = new Set(
      logRows
        .map((item) => item.stage_code)
        .filter((item): item is ProjectLogStageCode =>
          isProjectLogStageCode(item)
        ),
    );
    const acceptedStages = new Set(
      acceptanceRows
        .filter((item) => item.status === "customer_confirmed")
        .map((item) => item.stage_code),
    );

    const stages = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.map((stageCode) => {
      const previousStage = getPreviousProjectConstructionStage(stageCode);
      const blockedReason = previousStage && !acceptedStages.has(previousStage)
        ? `请先完成${this.getStageAcceptanceLabel(previousStage)}后再进入${this.getStageLabel(stageCode)}`
        : null;

      return this.buildStageItem({
        stageCode,
        acceptance: input.canReadAcceptance === false
          ? null
          : acceptanceMap.get(stageCode),
        latestLog: latestLogMap.get(stageCode),
        hasLog: logStageSet.has(stageCode),
        blockedReason,
        projectStatus: project.status,
        canCreateAcceptanceByPermission: input.canCreateAcceptance ?? true,
      });
    });
    const missingRequiredStages = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.filter(
      (stageCode) => !acceptedStages.has(stageCode),
    );
    const completionBlockedReason = project.status !== "acceptance"
      ? "项目进入竣工验收后才能发起竣工验收"
      : missingRequiredStages.length > 0
        ? `请先完成${
          missingRequiredStages.map((item) =>
            this.getStageAcceptanceLabel(item)
          ).join("、")
        }`
        : null;
    const completionStage = this.buildStageItem({
      stageCode: PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
      acceptance: input.canReadAcceptance === false
        ? null
        : acceptanceMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
      latestLog: latestLogMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
      hasLog: logStageSet.has(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
      blockedReason: completionBlockedReason,
      projectStatus: project.status,
      canCreateAcceptanceByPermission: input.canCreateAcceptance ?? true,
    });

    return {
      project_id: input.projectId,
      project_status: project.status,
      required_stage_codes: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
      required_completed: missingRequiredStages.length === 0,
      current_stage:
        stages.find((item) =>
          item.status !== "accepted" && item.status !== "locked"
        )?.stage_code ?? null,
      next_stage:
        stages.find((item) =>
          item.status !== "accepted" && item.status !== "locked"
        ) ?? null,
      missing_required_stages: missingRequiredStages.map((stageCode) => ({
        stage_code: stageCode,
        stage_label: this.getStageLabel(stageCode),
      })),
      stages: [...stages, completionStage],
      all_stage_codes: PROJECT_LOG_STAGE_CODE_VALUES,
    };
  }

  async assertCanCreateProjectLog(input: {
    projectId: string;
    tenantId?: string | null;
    stageCode: ProjectLogStageCode;
  }) {
    await this.assertCanEnterConstructionStage(input);
  }

  async assertCanCreateAcceptance(input: {
    project: ProjectAcceptanceProjectRow;
    stageCode: ProjectLogStageCode;
  }) {
    if (input.stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) {
      if (input.project.status !== "acceptance") {
        throw Errors.badRequest("项目进入竣工验收后才能发起竣工验收");
      }

      await this.assertProjectReadyForAcceptance({
        projectId: input.project.id,
        tenantId: input.project.tenant_id,
      });
      return;
    }

    await this.assertCanEnterConstructionStage({
      projectId: input.project.id,
      tenantId: input.project.tenant_id,
      stageCode: input.stageCode,
    });
  }

  async assertProjectReadyForAcceptance(input: {
    projectId: string;
    tenantId?: string | null;
  }) {
    const acceptedStages = await this.getAcceptedConstructionStages(input);
    const missing = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.filter(
      (stageCode) => !acceptedStages.has(stageCode),
    );

    if (missing.length > 0) {
      throw Errors.badRequest(
        `项目进入竣工验收前，必须先完成${
          missing.map((item) => this.getStageAcceptanceLabel(item)).join("、")
        }`,
      );
    }
  }

  private async assertCanEnterConstructionStage(input: {
    projectId: string;
    tenantId?: string | null;
    stageCode: ProjectLogStageCode;
  }) {
    if (!isProjectConstructionStageCode(input.stageCode)) {
      return;
    }

    const previousStage = getPreviousProjectConstructionStage(input.stageCode);
    if (!previousStage) {
      return;
    }

    const acceptedStages = await this.getAcceptedConstructionStages(input);
    if (!acceptedStages.has(previousStage)) {
      throw Errors.badRequest(
        `请先完成${this.getStageAcceptanceLabel(previousStage)}后再进入${
          this.getStageLabel(input.stageCode)
        }`,
      );
    }
  }

  private async getAcceptedConstructionStages(input: {
    projectId: string;
    tenantId?: string | null;
  }) {
    const rows = await projectAcceptanceRepository.listLatestAcceptancesByStages({
      projectId: input.projectId,
      stageCodes: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
      tenantId: input.tenantId,
    });

    return new Set(
      rows
        .filter((item) => item.status === "customer_confirmed")
        .map((item) => item.stage_code as ProjectConstructionStageCode),
    );
  }

  private getStageLabel(stageCode: ProjectLogStageCode) {
    return PROJECT_LOG_STAGE_CONFIG[stageCode]?.label || stageCode;
  }

  private getStageAcceptanceLabel(stageCode: ProjectLogStageCode) {
    return `${this.getStageLabel(stageCode)}验收`;
  }

  private async canAccessProjectByOptionalPermission(
    authContext: AuthContext,
    projectId: string,
    permissionCodes: string[],
  ) {
    for (const permissionCode of permissionCodes) {
      if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
        continue;
      }

      if (
        await accessPolicyService.canAccessProject(
          authContext,
          projectId,
          permissionCode,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private buildStageItem(input: {
    stageCode: ProjectLogStageCode;
    acceptance?: ProjectAcceptanceRow | null;
    latestLog?: ProjectLogLatestStageRow | null;
    hasLog: boolean;
    blockedReason: string | null;
    projectStatus?: string | null;
    canCreateAcceptanceByPermission: boolean;
  }) {
    const acceptance = input.acceptance ?? null;
    const latestLog = input.latestLog ?? null;
    const status: ProjectConstructionStageStatus = input.blockedReason
      ? "locked"
      : acceptance?.status === "customer_confirmed"
        ? "accepted"
        : acceptance?.status === "rejected"
          ? "rework_required"
          : acceptance
            ? "pending_acceptance"
            : input.hasLog
              ? "in_progress"
              : "not_started";
    const isCompletion =
      input.stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE;
    const isRequired = isProjectConstructionStageCode(input.stageCode);
    const isAcceptanceWritableStatus = input.projectStatus === "constructing" ||
      input.projectStatus === "acceptance";
    const canCreateLog = isRequired &&
      !input.blockedReason &&
      (input.projectStatus === "started" || input.projectStatus === "constructing") &&
      status !== "accepted" &&
      status !== "pending_acceptance";
    const canCreateAcceptance = !input.blockedReason &&
      !acceptance &&
      input.canCreateAcceptanceByPermission &&
      status !== "accepted" &&
      status !== "pending_acceptance" &&
      (isCompletion
        ? input.projectStatus === "acceptance"
        : isRequired && isAcceptanceWritableStatus);
    const acceptanceAction = this.buildAcceptanceAction({
      acceptance,
      canCreateAcceptance,
      blockedReason: input.blockedReason,
      canCreateAcceptanceByPermission: input.canCreateAcceptanceByPermission,
    });

    return {
      stage_code: input.stageCode,
      stage_label: this.getStageLabel(input.stageCode),
      status,
      is_required: isRequired,
      is_completion: isCompletion,
      can_create_log: canCreateLog,
      can_create_acceptance: canCreateAcceptance,
      acceptance_id: acceptance?.id ?? null,
      acceptance_status: acceptance?.status ?? null,
      acceptance: acceptance
        ? {
          id: acceptance.id,
          status: acceptance.status,
          status_label: ProjectAcceptanceStatusConfig[acceptance.status].label,
          stage_code: input.stageCode,
          stage_label: this.getStageLabel(input.stageCode),
          reviewed_at: acceptance.reviewed_at,
          customer_confirmed_at: acceptance.customer_confirmed_at,
          updated_at: acceptance.updated_at,
        }
        : null,
      acceptance_action: acceptanceAction,
      latest_log: latestLog
        ? {
          id: latestLog.id,
          node_name: latestLog.node_name,
          content: latestLog.content,
          created_at: latestLog.created_at,
        }
        : null,
      blocked_reason: input.blockedReason,
    };
  }

  private buildAcceptanceAction(input: {
    acceptance: ProjectAcceptanceRow | null;
    canCreateAcceptance: boolean;
    blockedReason: string | null;
    canCreateAcceptanceByPermission: boolean;
  }) {
    if (input.acceptance) {
      if (input.acceptance.status === "draft" || input.acceptance.status === "rejected") {
        return {
          type: "edit" as const,
          label: "处理验收",
          enabled: true,
          reason: null,
        };
      }

      return {
        type: "view" as const,
        label: "查看",
        enabled: true,
        reason: null,
      };
    }

    if (input.canCreateAcceptance) {
      return {
        type: "create" as const,
        label: "发起验收",
        enabled: true,
        reason: null,
      };
    }

    return {
      type: "none" as const,
      label: "",
      enabled: false,
      reason: input.canCreateAcceptanceByPermission
        ? input.blockedReason
        : "当前员工无验收创建权限",
    };
  }
}

export const constructionStageStatusService =
  new ConstructionStageStatusService();
