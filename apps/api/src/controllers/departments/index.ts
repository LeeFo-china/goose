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
  enabled: z.union([
    z.literal("true").transform(() => true),
    z.literal("false").transform(() => false),
    z.boolean(),
  ]).default(true),
});

type DepartmentTemplateRow = {
  id: string;
  code: string;
  default_name: string;
  sort: number | null;
};

type TenantDepartmentRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  code: string;
  alias_name: string;
  enabled: boolean;
  sort: number | null;
  legacy_department_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  department_templates?: DepartmentTemplateRow | DepartmentTemplateRow[] | null;
};

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

  private normalizeTemplate(value: TenantDepartmentRow["department_templates"]) {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private serializeTenantDepartment(row: TenantDepartmentRow) {
    const template = this.normalizeTemplate(row.department_templates);

    return {
      id: row.legacy_department_id,
      tenant_department_id: row.id,
      code: row.code,
      name: row.alias_name,
      template_name: template?.default_name ?? row.alias_name,
      enabled: row.enabled,
      sort: row.sort,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async findDepartmentTemplate(code: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("department_templates")
      .select("id, code, default_name, sort")
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw Errors.dbError("查询部门模板失败", error);
    if (!data) throw Errors.badRequest("部门模板不存在或已停用");

    return data as DepartmentTemplateRow;
  }

  private async ensureLegacyDepartment(input: {
    tenantId: string;
    code: string;
    name: string;
  }) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data: existing, error: existingError } = await adminClient
      .from("departments")
      .select("id, code, name, created_at")
      .eq("tenant_id", input.tenantId)
      .eq("code", input.code)
      .maybeSingle();

    if (existingError) throw Errors.dbError("查询兼容部门失败", existingError);
    if (existing) {
      return existing as {
        id: string;
        code: string;
        name: string;
        created_at: string | null;
      };
    }

    const { data, error } = await adminClient
      .from("departments")
      .insert({
        tenant_id: input.tenantId,
        code: input.code,
        name: input.name,
      })
      .select("id, code, name, created_at")
      .single();

    if (error) throw Errors.dbError("创建兼容部门失败", error);
    return data as { id: string; code: string; name: string; created_at: string | null };
  }

  private async syncTenantDepartmentConfig(input: {
    tenantId: string;
    department: { id: string; code: string; name: string };
    enabled?: boolean;
    sort?: number | null;
  }) {
    const adminClient = SupabaseDB.getAdminClient();
    const template = await this.findDepartmentTemplate(input.department.code);
    const payload = {
      tenant_id: input.tenantId,
      template_id: template.id,
      code: input.department.code,
      alias_name: input.department.name,
      enabled: input.enabled ?? true,
      sort: input.sort ?? template.sort ?? 0,
      legacy_department_id: input.department.id,
    };
    const { data: existing, error: existingError } = await adminClient
      .from("tenant_departments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("legacy_department_id", input.department.id)
      .maybeSingle();

    if (existingError) {
      throw Errors.dbError("查询租户部门配置失败", existingError);
    }

    if (existing?.id) {
      const { error } = await adminClient
        .from("tenant_departments")
        .update(payload)
        .eq("id", existing.id);

      if (error) throw Errors.dbError("同步租户部门配置失败", error);
      return;
    }

    const { error } = await adminClient
      .from("tenant_departments")
      .upsert(payload, { onConflict: "tenant_id,code" });

    if (error) throw Errors.dbError("同步租户部门配置失败", error);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const queryResult = DepartmentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, code, enabled } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select(`
        id,
        tenant_id,
        template_id,
        code,
        alias_name,
        enabled,
        sort,
        legacy_department_id,
        created_at,
        updated_at,
        department_templates (
          id,
          code,
          default_name,
          sort
        )
      `, { count: "exact" })
      .eq("tenant_id", tenantId);

    if (keyword) {
      const escaped = keyword.replaceAll(",", "\\,");
      query = query.or(`alias_name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
    }

    if (code) {
      query = query.eq("code", code);
    }

    if (enabled !== undefined) {
      query = query.eq("enabled", enabled);
    }

    const { data, error, count } = await query
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw Errors.dbError("部门列表查询失败", error);
    return ResponseHandler.success({
      list: ((data || []) as TenantDepartmentRow[]).map((row) =>
        this.serializeTenantDepartment(row)
      ),
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
      .from("tenant_departments")
      .select(`
        id,
        tenant_id,
        template_id,
        code,
        alias_name,
        enabled,
        sort,
        legacy_department_id,
        created_at,
        updated_at,
        department_templates (
          id,
          code,
          default_name,
          sort
        )
      `)
      .eq("legacy_department_id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("部门查询失败", error);
    if (!data) throw Errors.badRequest("部门不存在");
    return ResponseHandler.success(
      this.serializeTenantDepartment(data as TenantDepartmentRow),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const result = CreateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    const template = await this.findDepartmentTemplate(result.data.code);
    const aliasName = result.data.name || template.default_name;
    const legacyDepartment = await this.ensureLegacyDepartment({
      tenantId,
      code: template.code,
      name: aliasName,
    });

    await this.syncTenantDepartmentConfig({
      tenantId,
      department: legacyDepartment,
      enabled: result.data.enabled ?? true,
      sort: result.data.sort ?? template.sort ?? 0,
    });
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select(`
        id,
        tenant_id,
        template_id,
        code,
        alias_name,
        enabled,
        sort,
        legacy_department_id,
        created_at,
        updated_at,
        department_templates (
          id,
          code,
          default_name,
          sort
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("code", template.code)
      .maybeSingle();

    if (error) throw Errors.dbError("查询部门失败", error);
    if (!data) throw Errors.badRequest("部门启用失败");
    return ResponseHandler.success(
      this.serializeTenantDepartment(data as TenantDepartmentRow),
    );
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const tenantId = accessPolicyService.assertTenantContext(
      authContext,
      "组织架构必须在租户上下文中操作",
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (
      request.body &&
      typeof request.body === "object" &&
      "code" in request.body
    ) {
      throw Errors.badRequest("标准部门编码不可修改");
    }

    const result = UpdateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data: current, error: currentError } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id, code, alias_name, enabled, sort, legacy_department_id")
      .eq("legacy_department_id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (currentError) throw Errors.dbError("查询部门失败", currentError);
    if (!current?.legacy_department_id) throw Errors.badRequest("部门不存在或更新失败");

    const nextAliasName = result.data.name ?? current.alias_name;
    const legacyDepartment = await this.ensureLegacyDepartment({
      tenantId,
      code: current.code,
      name: nextAliasName,
    });

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .update({
        alias_name: nextAliasName,
        enabled: result.data.enabled ?? current.enabled,
        sort: result.data.sort ?? current.sort,
        legacy_department_id: legacyDepartment.id,
      })
      .eq("id", current.id)
      .select(`
        id,
        tenant_id,
        template_id,
        code,
        alias_name,
        enabled,
        sort,
        legacy_department_id,
        created_at,
        updated_at,
        department_templates (
          id,
          code,
          default_name,
          sort
        )
      `)
      .maybeSingle();

    if (error) throw Errors.dbError("更新部门失败", error);
    if (!data) throw Errors.badRequest("部门不存在或更新失败");
    return ResponseHandler.success(
      this.serializeTenantDepartment(data as TenantDepartmentRow),
    );
  };
}

export default new DepartmentController();
