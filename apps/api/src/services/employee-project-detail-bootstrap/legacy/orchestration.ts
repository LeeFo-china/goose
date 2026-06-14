import { workflowSubjectsService } from "@/services/workflow-subjects";
import {
  buildUnavailableProjectWorkflowProgress,
  projectWorkflowProgressService,
} from "@/services/project-workflow-progress";
import {
  projectLogService,
  projectSer,
} from "./shared";
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
  ProjectWorkflowState,
  WorkflowProgressResult,
  ProjectWorkflowBlockingState,
} from "./shared";

export type EmployeeProjectDetailBootstrapResult = {
  project: Awaited<
    ReturnType<typeof projectSer.getEmployeeProjectBootstrapBundle>
  >["project"];
  permissions: BootstrapPermissions;
  members: ProjectMembersResult;
  workflow_state: ProjectWorkflowState;
  workflow_progress: WorkflowProgressResult;
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
  const projectId = typeof project.id === "string" ? project.id : input.projectId;
  const tenantId = typeof project.tenant_id === "string"
    ? project.tenant_id
    : input.authContext.tenantId;
  const workflowProgress = await this.measure(
    "workflow_progress_ms",
    timings,
    async () => {
      try {
        return tenantId
          ? await projectWorkflowProgressService.getProjectProgress({
            tenantId,
            projectId,
            authContext: input.authContext,
          })
          : buildUnavailableProjectWorkflowProgress();
      } catch (error) {
        partialErrors.push(this.toPartialError("workflow_progress", error));
        return buildUnavailableProjectWorkflowProgress();
      }
    },
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
          workflowProgress,
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
  const workflowStateResult = await workflowSubjectsService.getState(
    input.authContext,
    {
      subjectType: "project",
      subjectId: typeof project.id === "string" ? project.id : input.projectId,
    },
  );
  const workflowState = workflowStateResult.workflow_state;
  const workflowBlockingReason = this.buildWorkflowBlockingReason(workflowState);
  const nextAction = this.buildNextAction({
    constructionStages,
    workflowBlockingReason,
  });

  return {
    project,
    permissions,
    members,
    workflow_state: workflowState,
    workflow_progress: workflowProgress,
    construction_stages: constructionStages,
    log_entry: this.buildProjectLogEntry({
      project,
      permissions,
      constructionStages,
      nextAction,
      workflowBlockingReason,
    }),
    next_action: nextAction,
    logs,
    calendar,
    referral_summary: input.query.include_referral_summary &&
        permissions.can_view_project_referral
      ? null
      : undefined,
    cameras_summary: input.query.include_cameras_summary ? null : undefined,
    server_time: new Date().toISOString(),
    partial_errors: partialErrors,
    timings,
  };
}

export function buildWorkflowBlockingReason(
  this: any,
  state: ProjectWorkflowBlockingState,
): string | null {
  if (
    state?.instance_status !== "running" ||
    state.current_business_kind !== "payment_collection"
  ) {
    return null;
  }

  const title = typeof state.current_node_title === "string" &&
      state.current_node_title.trim()
    ? state.current_node_title.trim()
    : "收款节点";
  return `请先完成${title}`;
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
