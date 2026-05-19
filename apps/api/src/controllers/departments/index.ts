import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from "@/schema/departments";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
  enabled: z.union([
    z.literal("true").transform(() => true),
    z.literal("false").transform(() => false),
    z.boolean(),
  ]).default(true),
});

const EnableDepartmentsBatchSchema = z.object({
  departments: z
    .array(CreateDepartmentSchema)
    .min(1, "请选择需要启用的部门")
    .max(DEPARTMENT_CODE_VALUES.length, "启用部门数量超出限制"),
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

class DepartmentController extends TenantBaseController<
  typeof CreateDepartmentSchema,
  typeof UpdateDepartmentSchema
> {
  constructor() {
    super("departments", CreateDepartmentSchema, UpdateDepartmentSchema);
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

  private async findDepartmentTemplates(codes: string[]) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("department_templates")
      .select("id, code, default_name, sort")
      .in("code", codes)
      .eq("enabled", true);

    if (error) throw Errors.dbError("查询部门模板失败", error);
    const templates = (data || []) as DepartmentTemplateRow[];
    const templateMap = new Map(templates.map((template) => [template.code, template]));
    const missingCode = codes.find((code) => !templateMap.has(code));
    if (missingCode) throw Errors.badRequest(`部门模板不存在或已停用：${missingCode}`);
    return templateMap;
  }

  private async ensureLegacyDepartments(input: {
    tenantId: string;
    departments: Array<{ code: string; name: string }>;
  }) {
    const adminClient = SupabaseDB.getAdminClient();
    const codes = Array.from(new Set(input.departments.map((department) => department.code)));
    const { data: existingData, error: existingError } = await adminClient
      .from("departments")
      .select("id, code, name, created_at")
      .eq("tenant_id", input.tenantId)
      .in("code", codes);

    if (existingError) throw Errors.dbError("查询兼容部门失败", existingError);

    const existingDepartments = (existingData || []) as Array<{
      id: string;
      code: string;
      name: string;
      created_at: string | null;
    }>;
    const departmentMap = new Map(existingDepartments.map((department) => [
      department.code,
      department,
    ]));
    const missingRows = input.departments
      .filter((department) => !departmentMap.has(department.code))
      .map((department) => ({
        tenant_id: input.tenantId,
        code: department.code,
        name: department.name,
      }));

    if (missingRows.length > 0) {
      const { data: insertedData, error: insertedError } = await adminClient
        .from("departments")
        .insert(missingRows)
        .select("id, code, name, created_at");

      if (insertedError) throw Errors.dbError("创建兼容部门失败", insertedError);
      for (const department of (insertedData || []) as typeof existingDepartments) {
        departmentMap.set(department.code, department);
      }
    }

    return departmentMap;
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
    template: DepartmentTemplateRow;
    department: { id: string; code: string; name: string };
    aliasName?: string;
    enabled?: boolean;
    sort?: number | null;
  }) {
    const adminClient = SupabaseDB.getAdminClient();
    const payload = {
      tenant_id: input.tenantId,
      template_id: input.template.id,
      code: input.department.code,
      alias_name: input.aliasName ?? input.department.name,
      enabled: input.enabled ?? true,
      sort: input.sort ?? input.template.sort ?? 0,
      legacy_department_id: input.department.id,
    };

    const { data, error } = await adminClient
      .from("tenant_departments")
      .upsert(payload, { onConflict: "tenant_id,code" })
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

    if (error) throw Errors.dbError("同步租户部门配置失败", error);
    if (!data) throw Errors.badRequest("部门启用失败");
    return data as TenantDepartmentRow;
  }

  private async syncTenantDepartmentConfigs(input: {
    tenantId: string;
    departments: Array<{
      template: DepartmentTemplateRow;
      department: { id: string; code: string; name: string };
      aliasName: string;
      enabled?: boolean;
      sort?: number | null;
    }>;
  }) {
    const rows = input.departments.map((item) => ({
      tenant_id: input.tenantId,
      template_id: item.template.id,
      code: item.department.code,
      alias_name: item.aliasName,
      enabled: item.enabled ?? true,
      sort: item.sort ?? item.template.sort ?? 0,
      legacy_department_id: item.department.id,
    }));

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .upsert(rows, { onConflict: "tenant_id,code" })
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
      `);

    if (error) throw Errors.dbError("批量同步租户部门配置失败", error);
    return (data || []) as TenantDepartmentRow[];
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
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
    const { tenantId } = await this.getRequiredTenantContext(request);
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
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = CreateDepartmentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    const template = await this.findDepartmentTemplate(result.data.code);
    const aliasName = result.data.name || template.default_name;
    const legacyDepartment = await this.ensureLegacyDepartment({
      tenantId,
      code: template.code,
      name: aliasName,
    });

    const department = await this.syncTenantDepartmentConfig({
      tenantId,
      template,
      department: legacyDepartment,
      aliasName,
      enabled: result.data.enabled ?? true,
      sort: result.data.sort ?? template.sort ?? 0,
    });
    return ResponseHandler.success(
      this.serializeTenantDepartment(department),
    );
  };

  enableBatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = EnableDepartmentsBatchSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const departmentMap = new Map(result.data.departments.map((department) => [
      department.code,
      department,
    ]));
    const departments = Array.from(departmentMap.values());
    const codes = departments.map((department) => department.code);
    const templateMap = await this.findDepartmentTemplates(codes);
    const legacyDepartmentMap = await this.ensureLegacyDepartments({
      tenantId,
      departments: departments.map((department) => ({
        code: department.code,
        name: department.name || templateMap.get(department.code)?.default_name || department.code,
      })),
    });

    const rows = departments.map((department) => {
      const template = templateMap.get(department.code);
      const legacyDepartment = legacyDepartmentMap.get(department.code);
      if (!template || !legacyDepartment) {
        throw Errors.badRequest(`部门启用失败：${department.code}`);
      }
      return {
        template,
        department: legacyDepartment,
        aliasName: department.name || template.default_name,
        enabled: department.enabled ?? true,
        sort: department.sort ?? template.sort ?? 0,
      };
    });

    const syncedDepartments = await this.syncTenantDepartmentConfigs({
      tenantId,
      departments: rows,
    });

    return ResponseHandler.success({
      list: syncedDepartments.map((department) => this.serializeTenantDepartment(department)),
    });
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
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

  public override registerExtraRoutes = (
    fastify: FastifyInstance,
    resourceName = "departments",
  ) => {
    fastify.post(`/${resourceName}/enable-batch`, this.enableBatch);
  };
}

export default new DepartmentController();
