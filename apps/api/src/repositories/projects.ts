import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type { UpdateProjectInput } from "@/schema/projects";

class ProjectRepository {
  async findById(id: string, tenantId?: string | null) {
    let query = SupabaseDB.from("projects")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    return data;
  }

  async update(id: string, input: UpdateProjectInput, tenantId?: string | null) {
    let query = SupabaseDB.from("projects")
      .update(input)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

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
