import { BaseController } from "@/controllers/BaseController";
import { CreateProjectSchema, UpdateProjectSchema } from "@/schema/projects";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class ProjectController extends BaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }
}

export default new ProjectController();
