import { Errors } from "@/errors/error-factory";
import {
  projectLogRepository,
  type ProjectLogCalendarRow,
} from "@/repositories/project-logs";
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
    const canWriteLog = await accessPolicyService.canAccessProject(
      input.authContext,
      input.payload.project_id,
      "project_log.create",
    );
    if (!canWriteLog) {
      throw Errors.forbidden();
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
    const canUpdateExisting = await accessPolicyService.canAccessProject(
      input.authContext,
      existingProjectId,
      "project_log.create",
    );
    if (!canUpdateExisting) {
      throw Errors.forbidden();
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
      const canUpdateTarget = await accessPolicyService.canAccessProject(
        input.authContext,
        payload.project_id,
        "project_log.create",
      );
      if (!canUpdateTarget) {
        throw Errors.forbidden();
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

  private async getRequiredProject(input: {
    projectId: string;
    tenantId: string;
  }) {
    const project = await projectLogRepository.findProjectById(input);
    if (!project) {
      throw Errors.badRequest("项目不存在");
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
