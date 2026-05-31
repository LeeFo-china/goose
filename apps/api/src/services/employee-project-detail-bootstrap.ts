import type { EmployeeProjectDetailBootstrapQuery } from "@/schema/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { projectLogService } from "@/services/project-logs";
import { projectSer } from "@/services/projects";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  isProjectStatus,
  listProjectStatusActions,
  type ProjectLogStageCode,
} from "@gooes/domain";

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

type ProjectLogEntrySummary = {
  can_create: boolean;
  writable_stage: {
    stage_code: ProjectLogStageCode;
    stage_label: string;
  } | null;
  blocked_reason: string | null;
  next_action: {
    kind: "acceptance" | "status" | "refresh";
    label: string;
    stage_code?: string | null;
    acceptance_id?: string | null;
    action?: string | null;
  } | null;
};

type ProjectDetailNextAction =
  | {
    kind: "acceptance";
    source: "project_acceptance";
    title: string;
    description: string;
    action_label: string;
    action_type: "create" | "edit" | "view";
    stage_code: ProjectLogStageCode;
    stage_label: string;
    acceptance_id: string | null;
    type: "create" | "edit" | "view";
    label: string;
    enabled: boolean;
    reason: string | null;
  }
  | {
    kind: "status";
    source: "project_status";
    title: string;
    description: string;
    action_label: string;
    action: string;
    to_status: string | null;
    type: string;
    label: string;
    enabled: boolean;
    reason: string | null;
    from_status: string | null;
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
    const nextAction = this.buildNextAction({
      statusActions,
      constructionStages,
    });

    return {
      project,
      permissions,
      members,
      status_actions: statusActions,
      construction_stages: constructionStages,
      log_entry: this.buildProjectLogEntry({
        project,
        permissions,
        constructionStages,
        statusActions,
        nextAction,
      }),
      next_action: nextAction,
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

  private buildProjectLogEntry(input: {
    project: Record<string, unknown>;
    permissions: BootstrapPermissions;
    constructionStages: ConstructionStagesResult | null;
    statusActions: StatusActionsResult;
    nextAction: ReturnType<EmployeeProjectDetailBootstrapService["buildNextAction"]>;
  }): ProjectLogEntrySummary {
    const stages = input.constructionStages?.stages ?? [];
    const writableStages = stages.filter((stage) =>
      stage.can_create_log === true &&
      stage.stage_code !== PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE
    );
    const currentStageCode = input.constructionStages?.current_stage ?? null;
    const writableStage =
      writableStages.find((stage) => stage.stage_code === currentStageCode) ??
      writableStages.find((stage) => stage.status === "in_progress") ??
      writableStages[0] ??
      null;

    if (input.permissions.can_create_project_log && writableStage) {
      return {
        can_create: true,
        writable_stage: {
          stage_code: writableStage.stage_code,
          stage_label: writableStage.stage_label,
        },
        blocked_reason: null,
        next_action: null,
      };
    }

    return {
      can_create: false,
      writable_stage: null,
      blocked_reason: this.buildProjectLogEntryBlockedReason(input),
      next_action: this.buildProjectLogEntryNextAction(input),
    };
  }

  private buildProjectLogEntryBlockedReason(input: {
    project: Record<string, unknown>;
    permissions: BootstrapPermissions;
    constructionStages: ConstructionStagesResult | null;
  }) {
    if (!input.permissions.scopes.project_log_create) {
      return "当前员工无施工日志创建权限";
    }

    const status = typeof input.project.status === "string"
      ? input.project.status
      : null;
    if (status !== "started" && status !== "constructing") {
      if (status === "invalid") return "无效项目不能新增施工日志";
      if (status === "on_hold") return "暂停项目不能新增施工日志";
      if (status === "acceptance") return "竣工验收项目不能新增施工日志";
      return "当前项目状态不能新增施工日志";
    }

    const stages = input.constructionStages?.stages ?? [];
    if (stages.length === 0) {
      return "施工阶段未同步，请刷新后重试";
    }

    const currentStage = stages.find((stage) =>
      stage.stage_code === input.constructionStages?.current_stage
    );
    const blockedStage = currentStage ?? stages.find((stage) =>
      stage.blocked_reason ||
      stage.status === "pending_acceptance" ||
      stage.status === "accepted"
    );
    if (blockedStage?.blocked_reason) {
      return blockedStage.blocked_reason;
    }
    if (blockedStage?.status === "pending_acceptance") {
      return `当前${blockedStage.stage_label}阶段待验收，完成验收后再补充施工日志`;
    }
    if (blockedStage?.status === "accepted") {
      return `当前${blockedStage.stage_label}阶段已验收完成，不能继续补充施工日志`;
    }

    return "当前暂无可写施工阶段";
  }

  private buildProjectLogEntryNextAction(input: {
    constructionStages: ConstructionStagesResult | null;
    statusActions: StatusActionsResult;
    nextAction: ReturnType<EmployeeProjectDetailBootstrapService["buildNextAction"]>;
  }): ProjectLogEntrySummary["next_action"] {
    const acceptanceStage = this.selectNextAcceptanceActionStage(
      input.constructionStages,
    );

    if (acceptanceStage?.acceptance_action?.type) {
      return {
        kind: "acceptance",
        label: acceptanceStage.acceptance_action.label || "处理验收",
        stage_code: acceptanceStage.stage_code,
        acceptance_id: acceptanceStage.acceptance_id ?? null,
        action: acceptanceStage.acceptance_action.type,
      };
    }

    const statusAction = input.statusActions.actions[0];
    if (statusAction) {
      return {
        kind: "status",
        label: statusAction.label,
        action: statusAction.action,
      };
    }

    if (input.nextAction?.kind === "status") {
      return {
        kind: "status",
        label: input.nextAction.action_label || input.nextAction.label,
        action: input.nextAction.action ?? input.nextAction.type ?? null,
      };
    }

    return null;
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
  }): ProjectDetailNextAction | null {
    const acceptanceStage = this.selectNextAcceptanceActionStage(
      input.constructionStages,
    );

    if (acceptanceStage?.acceptance_action?.type) {
      const actionType = acceptanceStage.acceptance_action.type as
        | "create"
        | "edit"
        | "view";
      const actionLabel = acceptanceStage.acceptance_action.label ||
        this.getAcceptanceActionLabel(actionType);
      const title = this.buildAcceptanceNextActionTitle({
        stageLabel: acceptanceStage.stage_label,
        actionType,
        actionLabel,
        acceptanceStatus: acceptanceStage.acceptance_status,
      });
      return {
        kind: "acceptance",
        source: "project_acceptance",
        title,
        description: this.buildAcceptanceNextActionDescription({
          stageLabel: acceptanceStage.stage_label,
          actionType,
          acceptanceStatus: acceptanceStage.acceptance_status,
        }),
        action_label: actionLabel,
        action_type: actionType,
        stage_code: acceptanceStage.stage_code,
        stage_label: acceptanceStage.stage_label,
        acceptance_id: acceptanceStage.acceptance_id ?? null,
        type: actionType,
        label: actionLabel,
        enabled: acceptanceStage.acceptance_action.enabled,
        reason: acceptanceStage.acceptance_action.reason,
      };
    }

    const statusAction = input.statusActions.actions[0];
    if (statusAction) {
      return {
        kind: "status",
        source: "project_status",
        title: "项目下一步",
        description: "按项目状态流转继续推进。",
        action_label: statusAction.label,
        action: statusAction.action,
        to_status: statusAction.to_status ?? null,
        type: statusAction.action,
        label: statusAction.label,
        enabled: true,
        reason: null,
        from_status: statusAction.from_status ?? null,
      };
    }

    return null;
  }

  private selectNextAcceptanceActionStage(
    constructionStages: ConstructionStagesResult | null,
  ) {
    const stages = constructionStages?.stages ?? [];
    const currentStageCode = constructionStages?.current_stage ?? null;

    return stages
      .filter((stage) =>
        stage.acceptance_action?.type &&
        stage.acceptance_action.type !== "none"
      )
      .sort((left, right) =>
        this.getAcceptanceActionPriority(left, currentStageCode) -
        this.getAcceptanceActionPriority(right, currentStageCode)
      )[0] ?? null;
  }

  private getAcceptanceActionPriority(
    stage: NonNullable<ConstructionStagesResult>["stages"][number],
    currentStageCode: string | null,
  ) {
    const actionType = stage.acceptance_action?.type;
    const disabledPenalty = stage.acceptance_action?.enabled === false ? 100 : 0;
    const currentStageBonus = stage.stage_code === currentStageCode ? -1 : 0;
    let priority = 20;

    if (stage.acceptance_status === "submitted") {
      priority = 0;
    } else if (actionType === "edit") {
      priority = 1;
    } else if (actionType === "create") {
      priority = 2;
    } else if (stage.status === "pending_acceptance") {
      priority = 3;
    } else if (actionType === "view") {
      priority = 10;
    }

    return disabledPenalty + priority + currentStageBonus;
  }

  private getAcceptanceActionLabel(actionType: "create" | "edit" | "view") {
    if (actionType === "create") return "发起验收";
    if (actionType === "edit") return "处理验收";
    return "查看验收";
  }

  private buildAcceptanceNextActionTitle(input: {
    stageLabel: string;
    actionType: "create" | "edit" | "view";
    actionLabel: string;
    acceptanceStatus?: string | null;
  }) {
    if (input.acceptanceStatus === "submitted") {
      return `${input.stageLabel}待复核`;
    }
    if (input.actionType === "edit") {
      return `${input.stageLabel}待处理`;
    }
    if (input.actionType === "view") {
      return `${input.stageLabel}验收记录`;
    }

    return `${input.stageLabel}可推进`;
  }

  private buildAcceptanceNextActionDescription(input: {
    stageLabel: string;
    actionType: "create" | "edit" | "view";
    acceptanceStatus?: string | null;
  }) {
    if (input.acceptanceStatus === "submitted") {
      return `员工已提交${input.stageLabel}验收，主管复核后进入业主确认。`;
    }
    if (input.actionType === "edit") {
      return `该阶段验收需要处理，完成后可继续推进${input.stageLabel}施工。`;
    }
    if (input.actionType === "view") {
      return `可查看${input.stageLabel}验收记录，确认阶段状态后再继续施工日志。`;
    }

    return `完成${input.stageLabel}施工后可发起阶段验收。`;
  }
}

export const employeeProjectDetailBootstrapService =
  new EmployeeProjectDetailBootstrapService();
