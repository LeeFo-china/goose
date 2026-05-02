import { BaseController } from "@/controllers/BaseController";
import {
  CreateProjectLogSchema,
  type CreateProjectLogInput,
  ProjectLogCalendarQuerySchema,
  type ProjectLogCalendarQueryType,
  type ProjectLogQueryType,
  type ProjectLogType,
  UpdateProjectLogSchema,
} from "@/schema/project-logs";
import { Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { ResponseHandler } from "@/utils/response";
import { ProjectLogQuerySchema } from "@/schema/project-logs";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import {
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

const PROJECT_LOGS_BUCKET = "project-logs";

type ProjectLogCalendarItem = {
  date: string;
  count: number;
  stage_code: ProjectLogStageCode | null;
  stage_label: string | null;
  node_name: string | null;
};

type ProjectLogCalendarRow = {
  date: string;
  count: number | string;
  stage_code: string | null;
  node_name: string | null;
};

type ProjectRecord = {
  id: string;
};

class ProjectLogController extends BaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private async getProject(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目不存在");
    }

    return data as ProjectRecord;
  }

  private normalizeProjectLogImages(images: unknown) {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        if (/^https?:\/\//i.test(item)) {
          return item;
        }

        return SupabaseDB.getAdminClient()
          .storage
          .from(PROJECT_LOGS_BUCKET)
          .getPublicUrl(item)
          .data.publicUrl;
      });
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
    const authContext = await this.getRequiredAuthContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    await this.getProject(result.data.project_id);
    const canWriteLog = await accessPolicyService.canAccessProject(
      authContext,
      result.data.project_id,
      "project_log.create",
    );
    if (!canWriteLog) {
      throw Errors.forbidden();
    }

    const payload = {
      ...result.data,
      employee_id: authContext.employeeId,
    };

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .insert(payload)
      .select(`
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `)
      .single();

    if (error) {
      throw Errors.dbError("创建项目日志失败", error);
    }

    return ResponseHandler.success(
      this.serializeProjectLog((data || {}) as Record<string, unknown>),
    );
  };

  @Get("/project_logs/projects")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const verify = ProjectLogQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);
    const { page, pageSize, project_id }: ProjectLogQueryType = verify.data;
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      project_id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await SupabaseDB.getAdminClient().from(this.tableName)
      .select(
        `
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `,
        { count: "exact" },
      )
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    return ResponseHandler.success({
      list: ((data || []) as Array<Record<string, unknown>>).map((item) =>
        this.serializeProjectLog(item)
      ),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/project_logs/projects/calendar")
  async getCalendar(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const verify = ProjectLogCalendarQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);

    const { project_id }: ProjectLogCalendarQueryType = verify.data;
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      project_id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }
    const { data, error } = await SupabaseDB.getClient().rpc(
      "get_project_log_calendar",
      {
        project_uuid: project_id,
      },
    );

    if (error) {
      throw Errors.dbError("查询项目日志日历失败", error);
    }

    const rows = (data || []) as ProjectLogCalendarRow[];
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
