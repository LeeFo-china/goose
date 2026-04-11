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

  @Get("/project_logs")
  async getByProjectId(request: FastifyRequest, reply: FastifyReply) {
    console.log(request.query);
    const paramSchema = z.object({
      project_id: z.uuid("无效的项目 ID!!!!!"),
    });

    const verify = paramSchema.safeParse(request.query);
    if (!verify.success) throw Errors.fromZod(verify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(`
        *,
        employee:employees(id, name, avatar)
      `)
      .eq("project_id", verify.data.project_id);

    if (error) {
      console.log(error);
      throw Errors.dbError("查询项目日志失败", error);
    }

    return ResponseHandler.success<any[]>(data);
  }
}

export default new ProjectLogController();
