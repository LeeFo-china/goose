import { BaseController } from "@/controllers/BaseController";
import {
  CreatePostSchema,
  UpdatePostSchema,
} from "@/schema/post";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  POST_CODE_VALUES,
  POST_STATUS_VALUES,
  SALARY_TYPE_VALUES,
} from "@gooes/domain";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase/index";

const PostListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
  keyword: z.string().trim().optional(),
  code: z.enum(POST_CODE_VALUES).optional(),
  salary_type: z.enum(SALARY_TYPE_VALUES).optional(),
  status: z.coerce.number().refine(
    (value) => POST_STATUS_VALUES.includes(value as (typeof POST_STATUS_VALUES)[number]),
    "无效的岗位状态",
  ).optional(),
});

class PostsController extends BaseController<
  typeof CreatePostSchema,
  typeof UpdatePostSchema
> {
  constructor() {
    super("posts", CreatePostSchema, UpdatePostSchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = PostListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, code, salary_type, status } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.from("posts")
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
    return ResponseHandler.success({
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  };
}

export default new PostsController();
