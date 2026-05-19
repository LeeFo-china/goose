import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreateProjectLogSchema,
  ProjectLogCalendarQuerySchema,
  type ProjectLogCalendarQueryType,
  type ProjectLogQueryType,
  UpdateProjectLogSchema,
} from "@/schema/project-logs";
import { Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { ProjectLogQuerySchema } from "@/schema/project-logs";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
import { projectLogService } from "@/services/project-logs";
import {
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

type ProjectLogCalendarItem = {
  date: string;
  count: number;
  stage_code: ProjectLogStageCode | null;
  stage_label: string | null;
  node_name: string | null;
};

class ProjectLogController extends TenantBaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

  private normalizeProjectLogImages(images: unknown) {
    return resolveStoredFileUrlList(images);
  }

  private serializeProjectLog<T extends Record<string, unknown>>(row: T) {
    const rawStageCode = typeof row.stage_code === "string" ? row.stage_code : null;
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(
      rawStageCode,
    )
      ? rawStageCode
      : null;

    return {
      ...row,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      images: this.normalizeProjectLogImages(row.images),
    };
  }

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const row = await projectLogService.createProjectLog({
      authContext,
      payload: result.data,
    });

    return ResponseHandler.success(
      this.serializeProjectLog(row),
    );
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const row = await projectLogService.getProjectLogDetail({
      authContext,
      id: idVerify.data.id,
    });

    return ResponseHandler.success(this.serializeProjectLog(row));
  };

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = this.paginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const result = await projectLogService.listProjectLogs({
      authContext,
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        this.serializeProjectLog(item)
      ),
      pagination: result.pagination,
    });
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const row = await projectLogService.updateProjectLog({
      authContext,
      id: idVerify.data.id,
      payload: result.data,
    });

    return ResponseHandler.success(
      this.serializeProjectLog(row),
    );
  };

  @Get("/project_logs/projects")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const verify = ProjectLogQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);
    const { page, pageSize, project_id }: ProjectLogQueryType = verify.data;
    const result = await projectLogService.listProjectLogsByProject({
      authContext,
      projectId: project_id,
      page,
      pageSize,
    });

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        this.serializeProjectLog(item)
      ),
      pagination: result.pagination,
    });
  }

  @Get("/project_logs/projects/calendar")
  async getCalendar(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const verify = ProjectLogCalendarQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);

    const { project_id }: ProjectLogCalendarQueryType = verify.data;
    const rows = await projectLogService.listProjectLogCalendar({
      authContext,
      projectId: project_id,
    });
    const list: ProjectLogCalendarItem[] = rows.map((item) => ({
      date: item.date,
      count: Number(item.count),
      stage_code: isProjectLogStageCode(item.stage_code)
        ? item.stage_code
        : null,
      stage_label: isProjectLogStageCode(item.stage_code)
        ? PROJECT_LOG_STAGE_CONFIG[item.stage_code].label
        : null,
      node_name: item.node_name,
    }));

    return ResponseHandler.success({
      project_id,
      list,
    });
  }
}

export default new ProjectLogController();
