import { TenantBaseController } from "@/controllers/TenantBaseController";
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
import { accessPolicyService } from "@/services/access-policy";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
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

type ProjectLogCalendarRow = {
  date: string;
  count: number | string;
  stage_code: string | null;
  node_name: string | null;
};

type ProjectRecord = {
  id: string;
  tenant_id: string | null;
};

class ProjectLogController extends TenantBaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

  private async getProject(projectId: string, tenantId: string) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id")
      .eq("id", projectId);

    query = query.eq("tenant_id", tenantId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目不存在");
    }

    return data as ProjectRecord;
  }

  private async getProjectLogById(id: string, tenantId: string) {
    let query = SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select(`
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `)
      .eq("id", id);

    query = query.eq("tenant_id", tenantId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    if (!data) {
      throw Errors.notFound("项目日志不存在");
    }

    return data as Record<string, unknown>;
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
    const tenantId = authContext.tenantId;

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const project = await this.getProject(result.data.project_id, tenantId);
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
      tenant_id: project.tenant_id,
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

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const tenantId = authContext.tenantId;
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const row = await this.getProjectLogById(idVerify.data.id, tenantId);
    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(this.serializeProjectLog(row));
  };

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const tenantId = authContext.tenantId;
    const queryResult = this.paginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    if (Array.isArray(visibleProjectIds) && visibleProjectIds.length === 0) {
      return ResponseHandler.success({
        list: [],
        pagination: {
          page: queryResult.data.page,
          pageSize: queryResult.data.pageSize,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select(`
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    query = query.eq("tenant_id", tenantId);

    if (Array.isArray(visibleProjectIds)) {
      query = query.in("project_id", visibleProjectIds);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询项目日志列表失败", error);
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
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const tenantId = authContext.tenantId;
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const existing = await this.getProjectLogById(idVerify.data.id, tenantId);
    const existingProjectId = typeof existing.project_id === "string"
      ? existing.project_id
      : "";
    const canUpdateExisting = await accessPolicyService.canAccessProject(
      authContext,
      existingProjectId,
      "project_log.create",
    );
    if (!canUpdateExisting) {
      throw Errors.forbidden();
    }

    const payload = { ...result.data } as Record<string, unknown>;
    if (typeof payload.project_id === "string") {
      const project = await this.getProject(payload.project_id, tenantId);
      const canUpdateTarget = await accessPolicyService.canAccessProject(
        authContext,
        payload.project_id,
        "project_log.create",
      );
      if (!canUpdateTarget) {
        throw Errors.forbidden();
      }
      payload.tenant_id = project.tenant_id;
    }

    let query = SupabaseDB.getAdminClient()
      .from(this.tableName)
      .update(payload)
      .eq("id", idVerify.data.id);

    query = query.eq("tenant_id", tenantId);

    const { data, error } = await query
      .select(`
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `)
      .single();

    if (error) {
      throw Errors.dbError("更新项目日志失败", error);
    }

    return ResponseHandler.success(
      this.serializeProjectLog((data || {}) as Record<string, unknown>),
    );
  };

  @Get("/project_logs/projects")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const tenantId = authContext.tenantId;
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
    let query = SupabaseDB.getAdminClient().from(this.tableName)
      .select(
        `
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `,
        { count: "exact" },
      )
      .eq("project_id", project_id);

    query = query.eq("tenant_id", tenantId);

    const { data, error, count } = await query
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
    const authContext = await this.getRequiredTenantContext(request);
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
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
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
