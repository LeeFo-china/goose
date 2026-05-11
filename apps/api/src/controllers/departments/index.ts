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
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";

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

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const queryResult = DepartmentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, code } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.from("departments")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId);

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

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("departments")
      .select("*")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("部门查询失败", error);
    if (!data) throw Errors.badRequest("部门不存在");
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const result = CreateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("departments")
      .insert({
        ...result.data,
        tenant_id: tenantId,
      })
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建部门失败", error);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("departments")
      .update(result.data)
      .eq("id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新部门失败", error);
    if (!data) throw Errors.badRequest("部门不存在或更新失败");
    return ResponseHandler.success(data);
  };
}

export default new DepartmentController();
