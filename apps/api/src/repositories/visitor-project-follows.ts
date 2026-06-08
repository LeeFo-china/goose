import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorProjectFollowActor = {
  visitorId: string;
  verifiedPhone: string;
};

class VisitorProjectFollowRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async follow(input: {
    projectId: string;
    actor: VisitorProjectFollowActor;
  }) {
    const { error } = await this.from("visitor_project_follows")
      .upsert(
        {
          project_id: input.projectId,
          visitor_id: input.actor.visitorId,
          verified_phone: input.actor.verifiedPhone,
        },
        { onConflict: "project_id,visitor_id", ignoreDuplicates: true },
      );

    if (error) {
      throw Errors.dbError("关注项目失败", error);
    }
  }

  async unfollow(input: {
    projectId: string;
    actor: VisitorProjectFollowActor;
  }) {
    const { error } = await this.from("visitor_project_follows")
      .delete()
      .eq("project_id", input.projectId)
      .eq("visitor_id", input.actor.visitorId);

    if (error) {
      throw Errors.dbError("取消关注项目失败", error);
    }
  }

  async isFollowing(input: {
    projectId: string;
    visitorId: string | null | undefined;
  }) {
    if (!input.visitorId) return false;

    const { count, error } = await this.from("visitor_project_follows")
      .select("project_id", { count: "exact", head: true })
      .eq("project_id", input.projectId)
      .eq("visitor_id", input.visitorId);

    if (error) {
      throw Errors.dbError("查询项目关注状态失败", error);
    }

    return (count || 0) > 0;
  }

  async countByProjectId(projectId: string) {
    const { count, error } = await this.from("visitor_project_follows")
      .select("project_id", { count: "exact", head: true })
      .eq("project_id", projectId);

    if (error) {
      throw Errors.dbError("查询项目关注数失败", error);
    }

    return count || 0;
  }

  async listFollowedProjectIds(input: {
    visitorId: string;
    page: number;
    pageSize: number;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    const { data, error, count } = await this.from("visitor_project_follows")
      .select("project_id", { count: "exact" })
      .eq("visitor_id", input.visitorId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询关注项目列表失败", error);
    }

    return {
      projectIds: ((data || []) as Array<{ project_id?: string | null }>)
        .map((item) => item.project_id)
        .filter((item): item is string => Boolean(item)),
      total: count || 0,
    };
  }
}

export const visitorProjectFollowRepository = new VisitorProjectFollowRepository();
