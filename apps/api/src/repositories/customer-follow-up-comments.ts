import { Errors } from "@/errors/error-factory";
import type { Tables } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerFollowUpCommentRow = Tables<"customer_follow_up_comments">;

export type CustomerFollowUpAccessRow = {
  id: string;
  customer_id: string | null;
  customer: {
    id: string;
    owner_id: string | null;
  } | null;
};

export type CustomerFollowUpCommentAuthorRow = {
  id: string;
  name: string | null;
  avatar: string | null;
  post: unknown;
};

export type CustomerFollowUpCommentSummaryRow = {
  id: string;
  follow_up_id: string;
  author_employee_id: string;
  content: string;
  created_at: string;
};

class CustomerFollowUpCommentRepository {
  async findFollowUpAccessById(followUpId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select(`
        id,
        customer_id,
        customer:customers!customer_follow_ups_customer_id_fkey(
          id,
          owner_id
        )
      `)
      .eq("id", followUpId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户跟进记录失败", error);
    }

    return (data as CustomerFollowUpAccessRow | null) ?? null;
  }

  async findCommentById(commentId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_up_comments")
      .select("*")
      .eq("id", commentId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询跟进评论失败", error);
    }

    return (data as CustomerFollowUpCommentRow | null) ?? null;
  }

  async listCommentsByFollowUpId(input: {
    followUpId: string;
    from: number;
    to: number;
  }) {
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("customer_follow_up_comments")
      .select("*", { count: "exact" })
      .eq("follow_up_id", input.followUpId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询跟进评论失败", error);
    }

    return {
      list: (data || []) as CustomerFollowUpCommentRow[],
      count: count || 0,
    };
  }

  async createComment(input: {
    follow_up_id: string;
    parent_id: string | null;
    author_employee_id: string;
    content: string;
    images: string[];
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_up_comments")
      .insert({
        follow_up_id: input.follow_up_id,
        parent_id: input.parent_id,
        author_employee_id: input.author_employee_id,
        content: input.content,
        images: input.images,
        status: "active",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建跟进评论失败", error);
    }

    return data as CustomerFollowUpCommentRow;
  }

  async listAuthorsByEmployeeIds(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return [] as CustomerFollowUpCommentAuthorRow[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select(`
        id,
        name,
        avatar,
        post:posts!employees_post_id_fkey(
          name
        )
      `)
      .in("id", employeeIds);

    if (error) {
      throw Errors.dbError("查询评论作者失败", error);
    }

    return ((data || []) as unknown) as CustomerFollowUpCommentAuthorRow[];
  }

  async listCommentSummariesByFollowUpIds(followUpIds: string[]) {
    if (followUpIds.length === 0) {
      return [] as CustomerFollowUpCommentSummaryRow[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_up_comments")
      .select("id, follow_up_id, author_employee_id, content, created_at")
      .in("follow_up_id", followUpIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询跟进评论摘要失败", error);
    }

    return (data || []) as CustomerFollowUpCommentSummaryRow[];
  }
}

export const customerFollowUpCommentRepository = new CustomerFollowUpCommentRepository();
