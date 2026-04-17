import { BaseController } from "@/controllers/BaseController";
import { CreateProjectSchema, UpdateProjectSchema } from "@/schema/projects";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { PaginationQuerySchema } from "@/schema/request";
import { ProjectListQuerySchema } from "@/schema/projects";
import { projectSer } from "@/services/projects";

class ProjectController extends BaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }

  @Get("/projects/frontend-visible")
  //获取游客页可以展示的项目
  async getFrontendVisibleProjects(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const visibleStatuses = ["signed", "constructing", "completed"];

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(`
    *,
    property:properties(id, community),
    designer:employees!projects_designer_id_fkey(id, name),
    supervisor:employees!projects_supervisor_id_fkey(id, name)
  `)
      .in("status", visibleStatuses)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询前端可展示项目失败", error);
    }

    return ResponseHandler.success(data, "查询成功");
  }

  @Get("/projects/status")
  async getProjectsBystatus(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await projectSer.getProjectsByStatus(queryResult.data);
    return ResponseHandler.success(data);
  }
}

export default new ProjectController();
