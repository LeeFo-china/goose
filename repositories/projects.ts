import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type { UpdateProjectInput } from "@/schema/projects";

class ProjectRepository {
  async findById(id: string) {
    const { data, error } = await SupabaseDB.from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    return data;
  }

  async update(id: string, input: UpdateProjectInput) {
    const { data, error } = await SupabaseDB.from("projects")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目不存在或更新失败");
    }

    return data;
  }
}

export const projectRepository = new ProjectRepository();
