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
import { projectSer } from "@/services/projects";
import { projectStatusService } from "@/services/project-status";
import { isProjectLogStageCode } from "@gooes/domain";

function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

class ProjectLogService {
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
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!input.authContext.employeeId) {
      throw Errors.forbidden();
    }

    const project = await this.getRequiredProject({
      projectId: input.payload.project_id,
      tenantId,
    });
    projectStatusService.assertCanCreateProjectLog(project);
    await constructionStageStatusService.assertCanCreateProjectLog({
      projectId: project.id,
      tenantId,
      stageCode: input.payload.stage_code,
    });
    const canWriteLog = await accessPolicyService.canWriteProjectLog(
      input.authContext,
      input.payload.project_id,
    );
    if (!canWriteLog) {
      throw Errors.business(
        403,
        "无施工日志创建权限",
        ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
      );
    }

    const row = await projectLogRepository.create({
      ...input.payload,
      tenant_id: project.tenant_id,
      employee_id: input.authContext.employeeId,
    });
    projectSer.invalidatePublicProjectLogsCache(input.payload.project_id);
    return row;
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
    if (
      typeof payload.project_id === "string" &&
      payload.project_id !== existingProjectId
    ) {
      projectSer.invalidatePublicProjectLogsCache(payload.project_id);
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
    const hasAccess = await accessPolicyService.canAccessProject(
      input.authContext,
      input.projectId,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const result = await projectLogRepository.listByProject({
      projectId: input.projectId,
      tenantId,
      from,
      to,
    });

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
    accessPolicyService.assertTenantContext(input.authContext);
    const hasAccess = await accessPolicyService.canAccessProject(
      input.authContext,
      input.projectId,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return projectLogRepository.listCalendarRows(input.projectId);
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
}

export const projectLogService = new ProjectLogService();
export type { ProjectLogCalendarRow };
