import type { EmployeeProjectDetailBootstrapQuery } from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { projectLogService } from "@/services/project-logs";
import { projectSer } from "@/services/projects";
import { isProjectStatus, listProjectStatusActions } from "@gooes/domain";

type PartialError = {
  module: string;
  code: string | null;
  message: string;
};

type BootstrapTimingStep =
  | "bootstrap_data_ms"
  | "project_ms"
  | "permissions_ms"
  | "members_ms"
  | "status_actions_ms"
  | "construction_stages_ms"
  | "logs_ms"
  | "calendar_ms";

export type EmployeeProjectDetailBootstrapTimings =
  Record<BootstrapTimingStep, number>;

const OPTIONAL_MODULE_TIMEOUT_MS = 2_500;

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
  ReturnType<typeof projectLogService.listProjectLogCommentCounts>
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

type InternalBootstrapPermissions = BootstrapPermissions & {
  internal_can_create_acceptance: boolean;
  internal_can_manage_acceptance: boolean;
};

class EmployeeProjectDetailBootstrapService {
  async getBootstrap(input: {
    authContext: AuthContext;
    projectId: string;
    query: EmployeeProjectDetailBootstrapQuery;
  }) {
    const partialErrors: PartialError[] = [];
    const timings = this.createEmptyTimings();
    const bundle = await this.measure("bootstrap_data_ms", timings, () =>
      projectSer.getEmployeeProjectBootstrapBundle({
        authContext: input.authContext,
        projectId: input.projectId,
        logPageSize: input.query.log_page_size,
      })
    );

    const project = bundle.project;
    const storedMembers = await this.measure(
      "members_ms",
      timings,
      () => Promise.resolve(projectSer.serializeProjectStoredMembers(bundle.members)),
    );
    const members = projectSer.buildProjectMembersForDetail(project, storedMembers);
    const basePermissions = await this.measure("permissions_ms", timings, () =>
      this.buildPermissionsFromKnownData({
        authContext: input.authContext,
        project,
        storedMembers,
        rawMembers: bundle.members,
      })
    );

    const [constructionStages, logs, calendar] =
      await Promise.all([
        this.measure("construction_stages_ms", timings, () =>
          projectSer.buildProjectConstructionStagesForBootstrapData({
            authContext: input.authContext,
            project,
            acceptanceRows: bundle.acceptance_rows,
            logStageRows: bundle.log_stage_rows,
            latestLogRows: bundle.latest_log_rows,
            canReadAcceptance: basePermissions.can_access_project_acceptance,
            canCreateAcceptance:
              basePermissions.internal_can_create_acceptance &&
              basePermissions.can_access_project_acceptance,
            canManageAcceptance: basePermissions.internal_can_manage_acceptance,
          })
        ),
        this.measure("logs_ms", timings, () =>
          Promise.resolve(this.buildLogsFromBundle(bundle, input.query.log_page_size))
        ),
        input.query.include_calendar
          ? this.loadOptional(
            "calendar",
            () => projectLogService.listProjectLogCalendar({
              authContext: input.authContext,
              projectId: input.projectId,
            }),
            [] as ProjectLogCalendarResult,
            partialErrors,
            timings,
            "calendar_ms",
          )
          : Promise.resolve(null),
      ]);

    const permissions = this.completePermissionsByStages(
      this.toPublicPermissions(basePermissions),
      constructionStages,
    );
    const rawStatusActions = await this.measure(
      "status_actions_ms",
      timings,
      () => Promise.resolve(this.buildStatusActionsFromProject(project)),
    );
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
      timings,
    };
  }

  private buildLogsFromBundle(
    bundle: Awaited<ReturnType<typeof projectSer.getEmployeeProjectBootstrapBundle>>,
    pageSize: number,
  ): ProjectLogListResult & {
    commentSummaries: ProjectLogCommentSummaryMap;
  } {
    const rows = bundle.logs.rows;
    const total = rows.length + (bundle.logs.has_more ? 1 : 0);

    return {
      rows,
      pagination: {
        page: 1,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
      commentSummaries: this.buildCommentAggregateMap(bundle.logs.comment_counts),
    };
  }

  private buildCommentAggregateMap(rows: Array<{
    log_id: string;
    comment_count: number | string;
  }>) {
    const map = new Map<string, {
      comment_count: number;
      latest_comment: null;
    }>();

    for (const row of rows) {
      const count = typeof row.comment_count === "number"
        ? row.comment_count
        : Number(row.comment_count);
      map.set(row.log_id, {
        comment_count: Number.isFinite(count) ? count : 0,
        latest_comment: null,
      });
    }

    return map;
  }

  private async loadProjectLogs(
    input: {
      authContext: AuthContext;
      projectId: string;
      query: EmployeeProjectDetailBootstrapQuery;
    },
    partialErrors: PartialError[],
    timings: EmployeeProjectDetailBootstrapTimings,
  ) {
    return this.loadOptional(
      "logs",
      async () => {
        const result = await projectLogService.listProjectLogBootstrapByProject({
          authContext: input.authContext,
          projectId: input.projectId,
          pageSize: input.query.log_page_size,
          skipReadAccessCheck: true,
        });
        const logIds = result.rows
          .map((row) => typeof row.id === "string" ? row.id : null)
          .filter((item): item is string => Boolean(item));
        const commentSummaries =
          await projectLogService.listProjectLogCommentCounts({
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
      timings,
      "logs_ms",
    );
  }

  private async loadOptional<T>(
    module: string,
    loader: () => Promise<T>,
    fallback: T,
    partialErrors: PartialError[],
    timings: EmployeeProjectDetailBootstrapTimings,
    step: BootstrapTimingStep,
  ) {
    try {
      return await this.measure(step, timings, () =>
        this.withTimeout(module, loader(), OPTIONAL_MODULE_TIMEOUT_MS)
      );
    } catch (error) {
      partialErrors.push(this.toPartialError(module, error));
      return fallback;
    }
  }

  private createEmptyTimings(): EmployeeProjectDetailBootstrapTimings {
    return {
      bootstrap_data_ms: 0,
      project_ms: 0,
      permissions_ms: 0,
      members_ms: 0,
      status_actions_ms: 0,
      construction_stages_ms: 0,
      logs_ms: 0,
      calendar_ms: 0,
    };
  }

  private async measure<T>(
    step: BootstrapTimingStep,
    timings: EmployeeProjectDetailBootstrapTimings,
    loader: () => Promise<T>,
  ) {
    const startedAt = Date.now();
    try {
      return await loader();
    } finally {
      timings[step] = Date.now() - startedAt;
    }
  }

  private withTimeout<T>(
    module: string,
    promise: Promise<T>,
    timeoutMs: number,
  ) {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${module} 模块加载超过 ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
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

  private buildStatusActionsFromProject(project: Record<string, unknown>): StatusActionsResult {
    const rawStatus = typeof project.status === "string" ? project.status : null;
    const currentStatus = isProjectStatus(rawStatus)
      ? rawStatus
      : "designing";

    return {
      current_status: currentStatus,
      paused_from_status: null,
      actions: listProjectStatusActions({
        fromStatus: currentStatus,
        pausedFromStatus: null,
      }),
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
    const canCreateProjectLogByStage = input.constructionStages
      ? input.constructionStages.stages?.some((item) => Boolean(item.can_create_log)) ??
        false
      : true;

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

  private async buildPermissionsFromKnownData(input: {
    authContext: AuthContext;
    project: Record<string, unknown>;
    storedMembers: ProjectMembersResult;
    rawMembers: Array<Record<string, unknown>>;
  }): Promise<InternalBootstrapPermissions> {
    const permissionMembers = input.rawMembers.length > 0
      ? input.rawMembers
      : input.storedMembers as unknown as Array<Record<string, unknown>>;
    const [
      canUpdateProject,
      canWriteProjectLogByPermission,
      canAccessAcceptance,
      canCreateAcceptance,
      canManageAcceptance,
    ] = await Promise.all([
      this.canAccessKnownProjectByPermission(
        input.authContext,
        input.project,
        permissionMembers,
        "project.update",
      ),
      this.canWriteKnownProjectLog(
        input.authContext,
        input.project,
        permissionMembers,
      ),
      this.canAccessKnownProjectByOptionalPermission(
        input.authContext,
        input.project,
        permissionMembers,
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
      this.canAccessKnownProjectByPermission(
        input.authContext,
        input.project,
        permissionMembers,
        "project_acceptance.create",
      ),
      this.canAccessKnownProjectByPermission(
        input.authContext,
        input.project,
        permissionMembers,
        "project_acceptance.manage",
      ),
    ]);

    return {
      employee_id: input.authContext.employeeId ?? null,
      can_read_project: true,
      can_update_project: canUpdateProject,
      can_manage_project_team: canUpdateProject,
      can_create_project_log: canWriteProjectLogByPermission,
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
      internal_can_create_acceptance: canCreateAcceptance,
      internal_can_manage_acceptance: canManageAcceptance,
    };
  }

  private toPublicPermissions(
    permissions: InternalBootstrapPermissions,
  ): BootstrapPermissions {
    const {
      internal_can_create_acceptance: _create,
      internal_can_manage_acceptance: _manage,
      ...publicPermissions
    } = permissions;

    return publicPermissions;
  }

  private async canAccessKnownProjectByOptionalPermission(
    authContext: AuthContext,
    project: Record<string, unknown>,
    members: Array<Record<string, unknown>>,
    permissionCodes: string[],
  ) {
    const results = await Promise.all(
      permissionCodes.map((permissionCode) =>
        this.canAccessKnownProjectByPermission(
          authContext,
          project,
          members,
          permissionCode,
        )
      ),
    );

    return results.some(Boolean);
  }

  private async canAccessKnownProjectByPermission(
    authContext: AuthContext,
    project: Record<string, unknown>,
    members: Array<Record<string, unknown>>,
    permissionCode: string,
  ) {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      return false;
    }

    const scope = accessPolicyService.getScope(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return false;
    }

    if (!this.isKnownProjectInTenant(authContext, project)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return this.hasDepartmentMember(authContext, members) ||
        accessPolicyService.canAccessProject(
          authContext,
          String(project.id ?? ""),
          permissionCode,
        );
    }

    return this.hasEmployeeProjectAccess(authContext, project, members);
  }

  private async canWriteKnownProjectLog(
    authContext: AuthContext,
    project: Record<string, unknown>,
    members: Array<Record<string, unknown>>,
  ) {
    if (!accessPolicyService.hasPermission(authContext, "project_log.create")) {
      return false;
    }

    const scope = accessPolicyService.getScope(authContext, "project_log.create");
    if (!scope || !authContext.employeeId) {
      return false;
    }

    if (!this.isKnownProjectInTenant(authContext, project)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return this.hasDepartmentMember(authContext, members) ||
        accessPolicyService.canWriteProjectLog(
          authContext,
          String(project.id ?? ""),
        );
    }

    return members.some((member) =>
      member.employee_id === authContext.employeeId &&
      !member.deleted_at
    );
  }

  private isKnownProjectInTenant(
    authContext: AuthContext,
    project: Record<string, unknown>,
  ) {
    if (authContext.isPlatformAdmin) {
      return true;
    }

    return Boolean(
      authContext.tenantId &&
      typeof project.tenant_id === "string" &&
      project.tenant_id === authContext.tenantId,
    );
  }

  private hasEmployeeProjectAccess(
    authContext: AuthContext,
    project: Record<string, unknown>,
    members: Array<Record<string, unknown>>,
  ) {
    if (!authContext.employeeId) {
      return false;
    }

    if (members.some((member) =>
      member.employee_id === authContext.employeeId &&
      !member.deleted_at
    )) {
      return true;
    }

    const customer = this.normalizeObject(project.customer);
    return customer?.owner_id === authContext.employeeId;
  }

  private hasDepartmentMember(
    authContext: AuthContext,
    members: Array<Record<string, unknown>>,
  ) {
    if (!authContext.tenantDepartmentId) {
      return false;
    }

    return members.some((member) => {
      const employee = this.normalizeObject(member.employee);
      return this.getRelationId(employee?.tenant_department) ===
        authContext.tenantDepartmentId;
    });
  }

  private normalizeObject(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
      return this.normalizeObject(value[0]);
    }

    return value && typeof value === "object"
      ? value as Record<string, unknown>
      : null;
  }

  private getRelationId(value: unknown) {
    const object = this.normalizeObject(value);
    return typeof object?.id === "string" ? object.id : null;
  }

  private completePermissionsByStages(
    permissions: BootstrapPermissions,
    constructionStages: ConstructionStagesResult | null,
  ): BootstrapPermissions {
    const canCreateProjectLogByStage = constructionStages?.stages
      ?.some((item) => Boolean(item.can_create_log)) ?? false;

    return {
      ...permissions,
      can_create_project_log: permissions.can_create_project_log &&
        canCreateProjectLogByStage,
    };
  }

  private async canAccessProjectByOptionalPermission(
    authContext: AuthContext,
    projectId: string,
    permissionCodes: string[],
  ) {
    const results = await Promise.all(
      permissionCodes.map((permissionCode) =>
        this.canAccessProjectByPermission(authContext, projectId, permissionCode)
      ),
    );

    return results.some(Boolean);
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
