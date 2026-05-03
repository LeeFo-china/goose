import { BaseController } from "@/controllers/BaseController";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from "@/schema/departments";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DEPARTMENT_CODE_VALUES } from "@gooes/domain";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase/index";

const DepartmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
  keyword: z.string().trim().optional(),
  code: z.enum(DEPARTMENT_CODE_VALUES).optional(),
});

class DepartmentController extends BaseController<
  typeof CreateDepartmentSchema,
  typeof UpdateDepartmentSchema
> {
  constructor() {
    super("departments", CreateDepartmentSchema, UpdateDepartmentSchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = DepartmentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, code } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.from("departments")
      .select("*", { count: "exact" });

    if (keyword) {
      const escaped = keyword.replaceAll(",", "\\,");
      query = query.or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
    }

    if (code) {
      query = query.eq("code", code);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("部门列表查询失败", error);
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

export default new DepartmentController();
