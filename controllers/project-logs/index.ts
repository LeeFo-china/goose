import { BaseController } from "@/controllers/BaseController";
import {
  CreateProjectLogSchema,
  type ProjectLogType,
  UpdateProjectLogSchema,
} from "@/schema/project-logs";
import { Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { ResponseHandler } from "@/utils/response";

class ProjectLogController extends BaseController<
  typeof CreateProjectLogSchema,
  typeof UpdateProjectLogSchema
> {
  constructor() {
    super("project_logs", CreateProjectLogSchema, UpdateProjectLogSchema);
  }

  @Get("/project-logs/project/:projectId")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    const paramSchema = z.object({
      projectId: z.string().uuid("无效的项目 ID"),
    });

    const verify = paramSchema.safeParse(request.params);
    if (!verify.success) throw Errors.fromZod(verify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(`
        *,
        employee:employees(id, name, avatar)
      `)
      .eq("project_id", verify.data.projectId)
      .order("created_at", { ascending: false });

    if (error) throw Errors.dbError("查询项目日志失败", error);

    return ResponseHandler.success<any[]>(data);
  }
}

export default new ProjectLogController();
