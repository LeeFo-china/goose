import type { EmployeeProjectDetailBootstrapQuery } from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { projectLogService } from "@/services/project-logs";
import { projectSer } from "@/services/projects";

type PartialError = {
  module: string;
  code: string | null;
  message: string;
};

type StatusActionsResult = Awaited<
  ReturnType<typeof projectSer.listProjectStatusActionsForTenant>
>;
type ConstructionStagesResult = Awaited<
  ReturnType<typeof projectSer.listProjectConstructionStagesForTenant>
>;
type ProjectLogListResult = Awaited<
  ReturnType<typeof projectLogService.listProjectLogsByProject>
>;
type ProjectMembersResult = Awaited<
  ReturnType<typeof projectSer.listProjectMembersForDetail>
>;
type ProjectLogCalendarResult = Awaited<
  ReturnType<typeof projectLogService.listProjectLogCalendar>
>;
type ProjectLogCommentSummaryMap = Awaited<
  ReturnType<typeof projectLogService.listProjectLogCommentSummaries>
>;

type BootstrapPermissions = {
  employee_id: string | null;
  can_read_project: boolean;
  can_update_project: boolean;
  can_manage_project_team: boolean;
  can_create_project_log: boolean;
  can_access_project_acceptance: boolean;
  can_manage_project_referral: boolean;
  scopes: {
    project_update: EffectivePermission["scope"] | null;
    project_log_create: EffectivePermission["scope"] | null;
    project_acceptance_manage: EffectivePermission["scope"] | null;
  };
};

class EmployeeProjectDetailBootstrapService {
  async getBootstrap(input: {
    authContext: AuthContext;
    projectId: string;
    query: EmployeeProjectDetailBootstrapQuery;
  }) {
    const project = await projectSer.getProjectDetailForEmployeeBootstrap({
      authContext: input.authContext,
      projectId: input.projectId,
    });
    const partialErrors: PartialError[] = [];

    const [members, rawStatusActions, constructionStages, logs, calendar] =
      await Promise.all([
        this.loadOptional(
          "members",
          () => projectSer.listProjectMembersForDetail(project),
          [] as ProjectMembersResult,
          partialErrors,
        ),
        this.loadOptional(
          "status_actions",
          () => projectSer.listProjectStatusActionsForTenant({
            authContext: input.authContext,
            projectId: input.projectId,
          }),
          this.emptyStatusActions(project),
          partialErrors,
        ),
        this.loadOptional(
          "construction_stages",
          () => projectSer.listProjectConstructionStagesForTenant({
            authContext: input.authContext,
            projectId: input.projectId,
          }),
          null as ConstructionStagesResult | null,
          partialErrors,
        ),
        this.loadProjectLogs(input, partialErrors),
        input.query.include_calendar
          ? this.loadOptional(
            "calendar",
            () => projectLogService.listProjectLogCalendar({
              authContext: input.authContext,
              projectId: input.projectId,
            }),
            [] as ProjectLogCalendarResult,
            partialErrors,
          )
          : Promise.resolve(null),
      ]);

    const permissions = await this.buildPermissions({
      authContext: input.authContext,
      projectId: input.projectId,
      constructionStages,
    });
    const statusActions = permissions.can_update_project
      ? rawStatusActions
      : {
        ...rawStatusActions,
        actions: [],
      };

    return {
      project,
      permissions,
      members,
      status_actions: statusActions,
      construction_stages: constructionStages,
      next_action: this.buildNextAction({
        statusActions,
        constructionStages,
      }),
      logs,
      calendar,
      referral_summary: input.query.include_referral_summary ? null : undefined,
      cameras_summary: input.query.include_cameras_summary ? null : undefined,
      server_time: new Date().toISOString(),
      partial_errors: partialErrors,
    };
  }

  private async loadProjectLogs(
    input: {
      authContext: AuthContext;
      projectId: string;
      query: EmployeeProjectDetailBootstrapQuery;
    },
    partialErrors: PartialError[],
  ) {
    return this.loadOptional(
      "logs",
      async () => {
        const result = await projectLogService.listProjectLogsByProject({
          authContext: input.authContext,
          projectId: input.projectId,
          page: 1,
          pageSize: input.query.log_page_size,
        });
        const logIds = result.rows
          .map((row) => typeof row.id === "string" ? row.id : null)
          .filter((item): item is string => Boolean(item));
        const commentSummaries =
          await projectLogService.listProjectLogCommentSummaries({
            authContext: input.authContext,
            logIds,
          });

        return {
          ...result,
          commentSummaries,
        };
      },
      {
        rows: [],
        pagination: {
          page: 1,
          pageSize: input.query.log_page_size,
          total: 0,
          totalPages: 0,
        },
        commentSummaries: new Map() as ProjectLogCommentSummaryMap,
      } satisfies ProjectLogListResult & {
        commentSummaries: ProjectLogCommentSummaryMap;
      },
      partialErrors,
    );
  }

  private async loadOptional<T>(
    module: string,
    loader: () => Promise<T>,
    fallback: T,
    partialErrors: PartialError[],
  ) {
    try {
      return await loader();
    } catch (error) {
      partialErrors.push(this.toPartialError(module, error));
      return fallback;
    }
  }

  private toPartialError(module: string, error: unknown): PartialError {
    const value = error as { code?: unknown; message?: unknown };

    return {
      module,
      code: typeof value.code === "string" ? value.code : null,
      message: typeof value.message === "string" ? value.message : "模块加载失败",
    };
  }

  private emptyStatusActions(project: Record<string, unknown>): StatusActionsResult {
    return {
      current_status: typeof project.status === "string" ? project.status : "designing",
      paused_from_status: null,
      actions: [],
    } as StatusActionsResult;
  }

  private async buildPermissions(input: {
    authContext: AuthContext;
    projectId: string;
    constructionStages: ConstructionStagesResult | null;
  }): Promise<BootstrapPermissions> {
    const [
      canUpdateProject,
      canWriteProjectLogByPermission,
      canAccessAcceptance,
    ] = await Promise.all([
      this.canAccessProjectByPermission(
        input.authContext,
        input.projectId,
        "project.update",
      ),
      this.canWriteProjectLog(input.authContext, input.projectId),
      this.canAccessProjectByOptionalPermission(
        input.authContext,
        input.projectId,
        [
          "project_acceptance.read",
          "project_acceptance.create",
          "project_acceptance.update_own",
          "project_acceptance.submit",
          "project_acceptance.review",
          "project_acceptance.reject",
          "project_acceptance.manage",
        ],
      ),
    ]);
    const canCreateProjectLogByStage = input.constructionStages?.stages
      ?.some((item) => Boolean(item.can_create_log)) ?? false;

    return {
      employee_id: input.authContext.employeeId ?? null,
      can_read_project: true,
      can_update_project: canUpdateProject,
      can_manage_project_team: canUpdateProject,
      can_create_project_log: canWriteProjectLogByPermission &&
        canCreateProjectLogByStage,
      can_access_project_acceptance: canAccessAcceptance,
      can_manage_project_referral: canUpdateProject,
      scopes: {
        project_update: accessPolicyService.getScope(
          input.authContext,
          "project.update",
        ),
        project_log_create: accessPolicyService.getScope(
          input.authContext,
          "project_log.create",
        ),
        project_acceptance_manage: accessPolicyService.getScope(
          input.authContext,
          "project_acceptance.manage",
        ),
      },
    };
  }

  private async canAccessProjectByOptionalPermission(
    authContext: AuthContext,
    projectId: string,
    permissionCodes: string[],
  ) {
    for (const permissionCode of permissionCodes) {
      if (
        await this.canAccessProjectByPermission(authContext, projectId, permissionCode)
      ) {
        return true;
      }
    }

    return false;
  }

  private async canAccessProjectByPermission(
    authContext: AuthContext,
    projectId: string,
    permissionCode: string,
  ) {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      return false;
    }

    return accessPolicyService.canAccessProject(
      authContext,
      projectId,
      permissionCode,
    );
  }

  private async canWriteProjectLog(authContext: AuthContext, projectId: string) {
    if (!accessPolicyService.hasPermission(authContext, "project_log.create")) {
      return false;
    }

    return accessPolicyService.canWriteProjectLog(authContext, projectId);
  }

  private buildNextAction(input: {
    statusActions: StatusActionsResult;
    constructionStages: ConstructionStagesResult | null;
  }) {
    const acceptanceStage = input.constructionStages?.stages.find((stage) =>
      stage.acceptance_action?.type && stage.acceptance_action.type !== "none" &&
      stage.acceptance_action.enabled
    ) ?? input.constructionStages?.stages.find((stage) =>
      stage.acceptance_action?.type && stage.acceptance_action.type !== "none"
    );

    if (acceptanceStage?.acceptance_action?.type) {
      return {
        source: "project_acceptance",
        stage_code: acceptanceStage.stage_code,
        stage_label: acceptanceStage.stage_label,
        type: acceptanceStage.acceptance_action.type,
        label: acceptanceStage.acceptance_action.label,
        enabled: acceptanceStage.acceptance_action.enabled,
        reason: acceptanceStage.acceptance_action.reason,
      };
    }

    const statusAction = input.statusActions.actions[0];
    if (statusAction) {
      return {
        source: "project_status",
        action: statusAction.action,
        type: statusAction.action,
        label: statusAction.label,
        enabled: true,
        reason: null,
        from_status: statusAction.from_status,
        to_status: statusAction.to_status,
      };
    }

    return null;
  }
}

export const employeeProjectDetailBootstrapService =
  new EmployeeProjectDetailBootstrapService();
