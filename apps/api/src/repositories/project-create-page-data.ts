import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

class ProjectCreatePageDataRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async getCreatePageData() {
    const { data, error } = await this.adminClient.rpc(
      "get_project_create_page_data",
    );

    if (error) {
      throw Errors.dbError("call rpc error", error);
    }

    return data;
  }
}

export const projectCreatePageDataRepository =
  new ProjectCreatePageDataRepository();
