import { Errors } from "@/errors/error-factory";
import type {
  CreatePostInput,
  UpdatePostInput,
} from "@/schema/post";
import { SupabaseDB } from "@/utils/supabase";

export type PostListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
  code?: string;
  salary_type?: string;
  status?: number;
};

export type PostRecord = {
  id: string;
  code: string;
  name: string;
  base_salary: number | null;
  salary_type: string | null;
  sort: number | null;
  status: number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

class PostsRepository {
  async list(params: PostListQuery) {
    const { page, pageSize, keyword, code, salary_type, status } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.getAdminClient()
      .from("posts")
      .select("*", { count: "exact" });

    if (keyword) {
      const escaped = keyword.replaceAll(",", "\\,");
      query = query.or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    }

    if (code) {
      query = query.eq("code", code);
    }

    if (salary_type) {
      query = query.eq("salary_type", salary_type);
    }

    if (status !== undefined) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("岗位列表查询失败", error);
    return {
      list: (data as PostRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询岗位失败", error);
    return (data as PostRecord | null) ?? null;
  }

  async findByCode(code: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) throw Errors.dbError("查询岗位编码失败", error);
    return (data as PostRecord | null) ?? null;
  }

  async create(input: CreatePostInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .insert(input)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("创建岗位失败", error);
    if (!data) throw Errors.badRequest("创建岗位失败");
    return data as PostRecord;
  }

  async update(id: string, input: UpdatePostInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新岗位失败", error);
    if (!data) throw Errors.badRequest("岗位不存在或更新失败");
    return data as PostRecord;
  }
}

export const postsRepository = new PostsRepository();
