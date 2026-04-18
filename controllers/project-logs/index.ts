import { BaseController } from "@/controllers/BaseController";
import {
  CreateProjectLogSchema,
  ProjectLogCalendarQuerySchema,
  type ProjectLogCalendarQueryType,
  type ProjectLogQueryType,
  type ProjectLogType,
  UpdateProjectLogSchema,
} from "@/schema/project-logs";
import { Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { ResponseHandler } from "@/utils/response";
import { ProjectLogQuerySchema } from "@/schema/project-logs";

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

class ProjectLogController extends BaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

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

    return ResponseHandler.success({
      list: data || [],
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
}

export default new ProjectLogController();
