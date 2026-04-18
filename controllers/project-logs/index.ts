import { BaseController } from "@/controllers/BaseController";
import {
  CreateProjectLogRequestSchema,
  type CreateProjectLogRequestType,
  CreateProjectLogSchema,
  ProjectLogIdParamSchema,
  type ProjectLogIdParamType,
  ProjectLogCalendarQuerySchema,
  type ProjectLogCalendarQueryType,
  type ProjectLogQueryType,
  type ProjectLogType,
  UpdateProjectLogImagesRequestSchema,
  type UpdateProjectLogImagesRequestType,
  UpdateProjectLogSchema,
} from "@/schema/project-logs";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { ResponseHandler } from "@/utils/response";
import { ProjectLogQuerySchema } from "@/schema/project-logs";
import type { Tables } from "@/types/database";

const PROJECT_LOGS_BUCKET = "project-logs";

type ProjectLogCalendarItem = {
  date: string;
  count: number;
  node_name: string | null;
};

type ProjectLogCalendarRow = {
  date: string;
  count: number | string;
  node_name: string | null;
};

type EmployeeUserRow = Pick<Tables<"employees">, "id" | "user_id">;
type ProjectLogRow = Tables<"project_logs"> & {
  employee?: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
};
type ProjectLogCommentCountRow = {
  log_id: string;
};
type ProjectLogListItem = ReturnType<ProjectLogController["normalizeProjectLogRow"]> & {
  comment_count: number;
};

class ProjectLogController extends BaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.handleCreate(request, reply);
  };

  @Get("/project_logs/projects")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    const verify = ProjectLogQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);
    const { page, pageSize, project_id }: ProjectLogQueryType = verify.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await SupabaseDB.from(this.tableName)
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

    const rows = (data || []) as ProjectLogRow[];
    const list = await this.attachCommentCounts(
      this.normalizeProjectLogRows(rows),
    );

    return ResponseHandler.success({
      list,
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
    const verify = ProjectLogCalendarQuerySchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);

    const { project_id }: ProjectLogCalendarQueryType = verify.data;
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
      node_name: item.node_name,
    }));

    return ResponseHandler.success({
      project_id,
      list,
    });
  }

  @Post("/project_logs")
  async createWithUnderscore(request: FastifyRequest, reply: FastifyReply) {
    return this.handleCreate(request, reply);
  }

  @Delete("/project_logs/:id")
  async deleteWithUnderscore(request: FastifyRequest, reply: FastifyReply) {
    const log = await this.getOwnedProjectLog(request);
    await this.removeStorageObjects(this.extractStoragePaths(log.images));

    const { error } = await SupabaseDB.from(this.tableName)
      .delete()
      .eq("id", log.id);

    if (error) {
      throw Errors.dbError("删除项目日志失败", error);
    }

    return ResponseHandler.success({
      id: log.id,
    });
  }

  @Patch("/project_logs/:id/images")
  async updateImages(request: FastifyRequest, reply: FastifyReply) {
    const log = await this.getOwnedProjectLog(request);
    const bodyResult = UpdateProjectLogImagesRequestSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const payload: UpdateProjectLogImagesRequestType = bodyResult.data;
    const nextImages = this.normalizeStoredImages(payload.images);
    const currentImages = this.extractStoragePaths(log.images);
    const nextImageSet = new Set(nextImages);
    const removedImages = currentImages.filter((item) => !nextImageSet.has(item));

    await this.removeStorageObjects(removedImages);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .update({
        images: nextImages,
      })
      .eq("id", log.id)
      .select(
        `
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `,
      )
      .single();

    if (error) {
      throw Errors.dbError("更新项目日志图片失败", error);
    }

    return ResponseHandler.success(
      this.normalizeProjectLogRow(data as ProjectLogRow),
    );
  }

  private async handleCreate(request: FastifyRequest, reply: FastifyReply) {
    const result = CreateProjectLogRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const userId = request.user?.sub;
    if (!userId) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const employeeId = await this.getEmployeeIdByUserId(userId);
    const payload: CreateProjectLogRequestType = result.data;
    const images = this.normalizeStoredImages(payload.images);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .insert({
        project_id: payload.project_id,
        employee_id: employeeId,
        node_name: payload.node_name,
        content: payload.content ?? null,
        images,
      })
      .select(
        `
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `,
      )
      .single();

    if (error) {
      throw Errors.dbError("创建项目日志失败", error);
    }

    return ResponseHandler.success(
      this.normalizeProjectLogRow(data as ProjectLogRow),
    );
  }

  private async getEmployeeIdByUserId(userId: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data, error } = await adminClient
      .from("employees")
      .select("id, user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle<EmployeeUserRow>();

    if (error) {
      throw Errors.dbError("查询当前员工身份失败", error);
    }

    if (!data?.id) {
      throw Errors.forbidden();
    }

    return data.id;
  }

  private async getOwnedProjectLog(request: FastifyRequest) {
    const paramResult = ProjectLogIdParamSchema.safeParse(request.params);
    if (!paramResult.success) throw Errors.fromZod(paramResult.error);

    const userId = request.user?.sub;
    if (!userId) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const employeeId = await this.getEmployeeIdByUserId(userId);
    const { id }: ProjectLogIdParamType = paramResult.data;
    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(
        `
        *,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `,
      )
      .eq("id", id)
      .maybeSingle<ProjectLogRow>();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目日志不存在");
    }

    if (data.employee_id !== employeeId) {
      throw Errors.forbidden();
    }

    return data;
  }

  private normalizeStoredImages(images?: string[]) {
    if (!images || images.length === 0) {
      return [];
    }

    return images.map((item) => this.toStoragePath(item));
  }

  private extractStoragePaths(images: ProjectLogRow["images"]) {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => this.toStoragePath(item));
  }

  private normalizeProjectLogRows(rows: ProjectLogRow[]) {
    return rows.map((row) => this.normalizeProjectLogRow(row));
  }

  private normalizeProjectLogRow(row: ProjectLogRow) {
    return {
      ...row,
      images: this.toPublicImageUrls(row.images),
    };
  }

  private toPublicImageUrls(images: ProjectLogRow["images"]) {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => {
        if (this.isHttpUrl(item)) {
          return item;
        }

        return SupabaseDB.getAdminClient()
          .storage
          .from(PROJECT_LOGS_BUCKET)
          .getPublicUrl(item)
          .data.publicUrl;
      });
  }

  private toStoragePath(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (!this.isHttpUrl(trimmed)) {
      return trimmed.replace(new RegExp(`^${PROJECT_LOGS_BUCKET}/`), "");
    }

    try {
      const url = new URL(trimmed);
      const marker = `/storage/v1/object/public/${PROJECT_LOGS_BUCKET}/`;
      const markerIndex = url.pathname.indexOf(marker);

      if (markerIndex === -1) {
        return trimmed;
      }

      return decodeURIComponent(
        url.pathname.slice(markerIndex + marker.length),
      );
    } catch {
      return trimmed;
    }
  }

  private isHttpUrl(value: string) {
    return value.startsWith("http://") || value.startsWith("https://");
  }

  private async removeStorageObjects(paths: string[]) {
    if (paths.length === 0) {
      return;
    }

    const uniquePaths = [...new Set(paths)];
    const { error } = await SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .remove(uniquePaths);

    if (error) {
      throw Errors.dbError("删除日志图片失败", error);
    }
  }

  private async attachCommentCounts(rows: ReturnType<ProjectLogController["normalizeProjectLogRows"]>): Promise<ProjectLogListItem[]> {
    if (rows.length === 0) {
      return [];
    }

    const logIds = rows.map((row) => row.id);
    const { data, error } = await SupabaseDB.from("project_log_comments")
      .select("log_id")
      .in("log_id", logIds)
      .is("deleted_at", null);

    if (error) {
      throw Errors.dbError("查询日志评论数量失败", error);
    }

    const countMap = new Map<string, number>();
    ((data || []) as ProjectLogCommentCountRow[]).forEach((item) => {
      const currentCount = countMap.get(item.log_id) || 0;
      const nextCount = currentCount + 1;
      countMap.set(item.log_id, nextCount);
    });

    return rows.map((row) => ({
      ...row,
      comment_count: countMap.get(row.id) || 0,
    }));
  }
}

export default new ProjectLogController();
