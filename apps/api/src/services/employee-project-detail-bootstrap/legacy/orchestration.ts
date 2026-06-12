import { isProjectStatus, listProjectStatusActions, projectLogService, projectSer } from "./shared";
import type {
  AuthContext,
  BootstrapPermissions,
  ConstructionStagesResult,
  EmployeeProjectDetailBootstrapQuery,
  EmployeeProjectDetailBootstrapTimings,
  PartialError,
  ProjectLogCalendarResult,
  ProjectLogCommentSummaryMap,
  ProjectDetailNextAction,
  ProjectLogEntrySummary,
  ProjectLogListResult,
  ProjectMembersResult,
  StatusActionsResult,
} from "./shared";

export type EmployeeProjectDetailBootstrapResult = {
  project: Awaited<
    ReturnType<typeof projectSer.getEmployeeProjectBootstrapBundle>
  >["project"];
  permissions: BootstrapPermissions;
  members: ProjectMembersResult;
  status_actions: StatusActionsResult;
  construction_stages: ConstructionStagesResult;
  log_entry: ProjectLogEntrySummary;
  next_action: ProjectDetailNextAction | null;
  logs: ProjectLogListResult & {
    commentSummaries: ProjectLogCommentSummaryMap;
  };
  calendar: ProjectLogCalendarResult | null;
  referral_summary?: null;
  cameras_summary?: null;
  server_time: string;
  partial_errors: PartialError[];
  timings: EmployeeProjectDetailBootstrapTimings;
};

export async function getBootstrap(this: any, input: {
  authContext: AuthContext;
  projectId: string;
  query: EmployeeProjectDetailBootstrapQuery;
}): Promise<EmployeeProjectDetailBootstrapResult> {
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

export async function loadProjectLogs(this: any, 
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

export function emptyStatusActions(this: any, project: Record<string, unknown>): StatusActionsResult {
  return {
    current_status: typeof project.status === "string" ? project.status : "designing",
    paused_from_status: null,
    actions: [],
    workflow_state: null,
  } as StatusActionsResult;
}

export function buildStatusActionsFromProject(this: any, project: Record<string, unknown>): StatusActionsResult {
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
    workflow_state: null,
  } as StatusActionsResult;
}
