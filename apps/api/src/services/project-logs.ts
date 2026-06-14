import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  projectLogRepository,
  type ProjectLogCalendarRow,
} from "@/repositories/project-logs";
import {
  projectLogCommentsRepository,
  type ProjectLogCommentCountRow,
  type ProjectLogCommentSummaryRow,
} from "@/repositories/project-log-comments";
import type {
  CreateProjectLogInput,
  UpdateProjectLogInput,
} from "@/schema/project-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { assertProjectWorkflowStageMutationAllowed } from "@/services/project-workflow-mutation-guards";
import { projectSer } from "@/services/projects";
import { projectStatusService } from "@/services/project-status";
import { isProjectLogStageCode } from "@gooes/domain";
import { ProjectLogCalendarCache } from "./project-logs/calendar-cache";
import { ProjectLogProjectListCache } from "./project-logs/project-list-cache";

type ProjectLogCreateTimingSteps = Record<string, number>;

function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

async function measureProjectLogCreateStep<T>(
  timings: ProjectLogCreateTimingSteps | undefined,
  step: string,
  operation: () => Promise<T>,
) {
  if (!timings) {
    return operation();
  }

  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    timings[step] = Date.now() - startedAt;
  }
}

class ProjectLogService {
  private projectLogCalendarCache = new ProjectLogCalendarCache();
  private projectLogProjectListCache = new ProjectLogProjectListCache();

  buildCommentCountMap(rows: ProjectLogCommentCountRow[]) {
    const map = new Map<string, {
      comment_count: number;
      latest_comment: null;
    }>();

    for (const row of rows) {
      const current = map.get(row.log_id) || {
        comment_count: 0,
        latest_comment: null,
      };
      current.comment_count += 1;
      map.set(row.log_id, current);
    }

    return map;
  }

  buildCommentSummaryMap(rows: ProjectLogCommentSummaryRow[]) {
    const map = new Map<string, {
      comment_count: number;
      latest_comment: ProjectLogCommentSummaryRow | null;
    }>();

    for (const row of rows) {
      const current = map.get(row.log_id) || {
        comment_count: 0,
        latest_comment: null,
      };
      current.comment_count += 1;

      const latestTime = current.latest_comment?.created_at
        ? new Date(current.latest_comment.created_at).getTime()
        : 0;
      const rowTime = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (!current.latest_comment || rowTime >= latestTime) {
        current.latest_comment = row;
      }

      map.set(row.log_id, current);
    }

    return map;
  }

  async createProjectLog(input: {
    authContext: AuthContext;
    payload: CreateProjectLogInput;
    collectTiming?: boolean;
  }) {
    const timings = input.collectTiming ? {} : undefined;
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!input.authContext.employeeId) {
      throw Errors.forbidden();
    }
    const project = await measureProjectLogCreateStep(
      timings,
      "guard_ms",
      () => this.getRequiredProject({ projectId: input.payload.project_id, tenantId }),
    );
    projectStatusService.assertCanCreateProjectLog(project);
    const stageCode = isProjectLogStageCode(input.payload.stage_code) ? input.payload.stage_code : null;
    if (stageCode) {
      await measureProjectLogCreateStep(
        timings,
        "workflow_guard_ms",
        () => assertProjectWorkflowStageMutationAllowed({
          tenantId,
          projectId: project.id,
          stageCode,
          mutation: "create_project_log",
        }),
      );
    }

    const row = await measureProjectLogCreateStep(
      timings,
      "create_rpc_ms",
      () => projectLogRepository.createFast({
        tenantId,
        employeeId: input.authContext.employeeId!,
        tenantDepartmentId: input.authContext.tenantDepartmentId,
        projectLogScope: accessPolicyService.getScope(
          input.authContext,
          "project_log.create",
        ),
        payload: input.payload,
      }),
    );
    projectSer.invalidatePublicProjectLogsCache(input.payload.project_id);
    this.projectLogCalendarCache.updateAfterCreate({
      tenantId,
      projectId: input.payload.project_id,
      row,
    });
    this.projectLogProjectListCache.updateAfterCreate({
      tenantId,
      projectId: input.payload.project_id,
      row,
    });
    return { row, timings };
  }

  async getProjectLogDetail(input: {
    authContext: AuthContext;
    id: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const row = await this.getRequiredProjectLog({
      id: input.id,
      tenantId,
    });
    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    const hasAccess = await accessPolicyService.canAccessProject(
      input.authContext,
      projectId,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return row;
  }

  async listProjectLogs(input: {
    authContext: AuthContext;
    page: number;
    pageSize: number;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      input.authContext,
      "project.read",
    );
    if (Array.isArray(visibleProjectIds) && visibleProjectIds.length === 0) {
      return {
        rows: [] as Array<Record<string, unknown>>,
        pagination: buildPagination(input.page, input.pageSize, 0),
      };
    }

    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const result = await projectLogRepository.list({
      tenantId,
      visibleProjectIds,
      from,
      to,
    });

    return {
      rows: result.rows,
      pagination: buildPagination(input.page, input.pageSize, result.total),
    };
  }

  async updateProjectLog(input: {
    authContext: AuthContext;
    id: string;
    payload: UpdateProjectLogInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const existing = await this.getRequiredProjectLog({
      id: input.id,
      tenantId,
    });
    const existingProjectId = typeof existing.project_id === "string"
      ? existing.project_id
      : "";
    const canUpdateExisting = await accessPolicyService.canWriteProjectLog(
      input.authContext,
      existingProjectId,
    );
    if (!canUpdateExisting) {
      throw Errors.business(
        403,
        "无施工日志创建权限",
        ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
      );
    }

    const payload = { ...input.payload } as Record<string, unknown>;
    const targetProjectId = typeof payload.project_id === "string"
      ? payload.project_id
      : existingProjectId;
    const targetStageCode = typeof payload.stage_code === "string" &&
        isProjectLogStageCode(payload.stage_code)
      ? payload.stage_code
      : null;
    if (typeof payload.project_id === "string") {
      const project = await this.getRequiredProject({
        projectId: payload.project_id,
        tenantId,
      });
      projectStatusService.assertCanCreateProjectLog(project);
      const canUpdateTarget = await accessPolicyService.canWriteProjectLog(
        input.authContext,
        payload.project_id,
      );
      if (!canUpdateTarget) {
        throw Errors.business(
          403,
          "无施工日志创建权限",
          ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
        );
      }
      payload.tenant_id = project.tenant_id;
    }
    if (targetStageCode) {
      const targetProject = await this.getRequiredProject({
        projectId: targetProjectId,
        tenantId,
      });
      projectStatusService.assertCanCreateProjectLog(targetProject);
      await constructionStageStatusService.assertCanCreateProjectLog({
        projectId: targetProject.id,
        tenantId,
        stageCode: targetStageCode,
      });
    }

    const row = await projectLogRepository.update({
      id: input.id,
      tenantId,
      payload,
    });
    projectSer.invalidatePublicProjectLogsCache(existingProjectId);
    this.projectLogCalendarCache.invalidate({
      tenantId,
      projectId: existingProjectId,
    });
    this.projectLogProjectListCache.invalidateProject({
      tenantId,
      projectId: existingProjectId,
    });
    if (
      typeof payload.project_id === "string" &&
      payload.project_id !== existingProjectId
    ) {
      projectSer.invalidatePublicProjectLogsCache(payload.project_id);
      this.projectLogCalendarCache.invalidate({
        tenantId,
        projectId: payload.project_id,
      });
      this.projectLogProjectListCache.invalidateProject({
        tenantId,
        projectId: payload.project_id,
      });
    }
    return row;
  }

  async listProjectLogsByProject(input: {
    authContext: AuthContext;
    projectId: string;
    page: number;
    pageSize: number;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const [hasAccess, result] = await Promise.all([
      this.canReadProjectForProjectLogs(input),
      this.projectLogProjectListCache.getOrLoad(
        {
          tenantId,
          projectId: input.projectId,
          page: input.page,
          pageSize: input.pageSize,
        },
        () => projectLogRepository.listByProject({
          projectId: input.projectId,
          tenantId,
          from,
          to,
        }),
      ),
    ]);
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return {
      rows: result.rows,
      pagination: buildPagination(input.page, input.pageSize, result.total),
    };
  }

  async listProjectLogBootstrapByProject(input: {
    authContext: AuthContext;
    projectId: string;
    pageSize: number;
    skipReadAccessCheck?: boolean;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const from = 0;
    const hasReadAllScope =
      accessPolicyService.getScope(input.authContext, "project.read") === "all";
    if (!input.skipReadAccessCheck && !hasReadAllScope) {
      const hasAccess = await accessPolicyService.canAccessProject(
        input.authContext,
        input.projectId,
        "project.read",
      );
      if (!hasAccess) {
        throw Errors.forbidden();
      }
    }

    const result = await projectLogRepository.listBootstrapByProject({
      projectId: input.projectId,
      tenantId,
      from,
      limit: input.pageSize,
    });
    const total = result.rows.length + (result.hasMore ? 1 : 0);

    return {
      rows: result.rows,
      pagination: {
        page: 1,
        pageSize: input.pageSize,
        total,
        totalPages: total ? Math.ceil(total / input.pageSize) : 0,
      },
    };
  }

  async listProjectLogCalendar(input: {
    authContext: AuthContext;
    projectId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const [hasAccess, rows] = await Promise.all([
      this.canReadProjectForProjectLogs(input),
      this.projectLogCalendarCache.getOrLoad(
        { projectId: input.projectId, tenantId },
        () => projectLogRepository.listCalendarRows({
          projectId: input.projectId,
          tenantId,
        }),
      ),
    ]);
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return rows;
  }

  async listProjectLogCommentSummaries(input: {
    authContext: AuthContext;
    logIds: string[];
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const normalizedLogIds = Array.from(
      new Set(input.logIds.filter((item) => typeof item === "string" && item)),
    );

    return this.buildCommentSummaryMap(
      await projectLogCommentsRepository.listSummariesByLogIds({
        logIds: normalizedLogIds,
        tenantId,
      }),
    );
  }

  async listProjectLogCommentCounts(input: {
    authContext: AuthContext;
    logIds: string[];
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const normalizedLogIds = Array.from(
      new Set(input.logIds.filter((item) => typeof item === "string" && item)),
    );

    return this.buildCommentCountMap(
      await projectLogCommentsRepository.listCountRowsByLogIds({
        logIds: normalizedLogIds,
        tenantId,
      }),
    );
  }

  private async getRequiredProject(input: {
    projectId: string;
    tenantId: string;
  }) {
    const project = await projectLogRepository.findProjectById(input);
    if (!project) {
      throw Errors.business(
        404,
        "项目不存在或不可见",
        ErrorCodes.PROJECT_LOG_PROJECT_NOT_FOUND,
      );
    }

    return project;
  }

  private async getRequiredProjectLog(input: {
    id: string;
    tenantId: string;
  }) {
    const row = await projectLogRepository.findById(input);
    if (!row) {
      throw Errors.notFound("项目日志不存在");
    }

    return row;
  }

  private async canReadProjectForProjectLogs(input: {
    authContext: AuthContext;
    projectId: string;
  }) {
    if (
      input.authContext.employeeId &&
      accessPolicyService.getScope(input.authContext, "project.read") !== "all"
    ) {
      await projectSer.getEmployeeProjectBootstrapBundle({
        authContext: input.authContext,
        projectId: input.projectId,
        logPageSize: 1,
      });
      return true;
    }

    return accessPolicyService.canAccessProject(
      input.authContext,
      input.projectId,
      "project.read",
    );
  }

}

export const projectLogService = new ProjectLogService();
export type { ProjectLogCalendarRow };
