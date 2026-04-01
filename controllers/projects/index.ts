import { BaseController } from "@/controllers/BaseController";
import { CreateProjectSchema, UpdateProjectSchema } from "@/schema/projects";
import { SupabaseDB } from "@/utils/supabase/index";
import type { FastifyInstance } from "fastify";
// import type { Tables, Inserts, Updates } from "@/types/db";

class ProjectController extends BaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }

  public override registerExtraRoutes = async (
    app: FastifyInstance,
    tableName: string,
  ): Promise<void> => {};
}

export default new ProjectController();
