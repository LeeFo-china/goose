import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  CatalogOwnership,
  TenantCatalogBrandCreateRecord,
  TenantCatalogBrandUpdateRecord,
  TenantCatalogCategoryCreateRecord,
  TenantCatalogCategoryUpdateRecord,
} from "@/schema/supplier-catalog";
import type { SupabaseDB } from "@/utils/supabase";

type CatalogClient = ReturnType<typeof SupabaseDB.getAdminClient>;

const categoryResultSchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  level: z.number().int().min(1).max(8),
  status: z.enum(["active", "inactive"]),
  sort_order: z.number().int(),
  version: z.number().int().positive(),
  created_by_employee_id: z.uuid().optional(),
  updated_by_employee_id: z.uuid().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

const brandResultSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string().nullable(),
  logo_file_id: z.uuid().nullable(),
  status: z.enum(["active", "inactive"]),
  sort_order: z.number().int(),
  version: z.number().int().positive(),
  created_by_employee_id: z.uuid().optional(),
  updated_by_employee_id: z.uuid().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

export type TenantCatalogCategory = z.infer<typeof categoryResultSchema>;
export type TenantCatalogBrand = z.infer<typeof brandResultSchema>;

async function callTenantCatalogCommand<T>(
  client: CatalogClient,
  functionName: string,
  resourceKey: "category" | "brand",
  resourceSchema: z.ZodType<T>,
  message: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(functionName, params);
  if (error) throw Errors.dbError(message, error);
  const envelope = z.object({ status: z.string() })
    .passthrough()
    .safeParse(data);
  if (!envelope.success) throw Errors.dbError(message, envelope.error.issues);
  const resource = resourceSchema.safeParse(envelope.data[resourceKey]);
  if (!resource.success) throw Errors.dbError(message, resource.error.issues);
  return resource.data;
}

export async function getTenantSupplierSettings(
  client: CatalogClient,
  tenantId: string,
): Promise<{ private_catalog_writes_enabled: boolean } | null> {
  const { data, error } = await client.from("tenant_supplier_settings")
    .select("private_catalog_writes_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw Errors.dbError("查询租户供应商设置失败", error);
  return data === null
    ? null
    : { private_catalog_writes_enabled: data.private_catalog_writes_enabled === true };
}

export async function findCategoryOwnership(
  client: CatalogClient,
  categoryId: string,
): Promise<CatalogOwnership | null> {
  const { data, error } = await client.from("catalog_categories")
    .select("ownership_scope, owner_tenant_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw Errors.dbError("查询目录分类失败", error);
  if (data === null) return null;
  return {
    ownershipScope: data.ownership_scope as "platform" | "tenant",
    ownerTenantId: data.owner_tenant_id,
  };
}

export async function findBrandOwnership(
  client: CatalogClient,
  brandId: string,
): Promise<CatalogOwnership | null> {
  const { data, error } = await client.from("catalog_brands")
    .select("ownership_scope, owner_tenant_id")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw Errors.dbError("查询目录品牌失败", error);
  if (data === null) return null;
  return {
    ownershipScope: data.ownership_scope as "platform" | "tenant",
    ownerTenantId: data.owner_tenant_id,
  };
}

export function createTenantCategory(
  client: CatalogClient,
  input: TenantCatalogCategoryCreateRecord,
): Promise<TenantCatalogCategory> {
  return callTenantCatalogCommand(
    client,
    "create_tenant_catalog_category",
    "category",
    categoryResultSchema,
    "新增租户目录分类失败",
    {
      p_category_id: input.category_id,
      p_tenant_id: input.tenant_id,
      p_parent_id: input.parent_id,
      p_code: input.code,
      p_name: input.name,
      p_mapped_platform_category_id: input.mapped_platform_category_id ?? null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    },
  );
}

export function updateTenantCategory(
  client: CatalogClient,
  input: TenantCatalogCategoryUpdateRecord,
): Promise<TenantCatalogCategory> {
  return callTenantCatalogCommand(
    client,
    "update_tenant_catalog_category",
    "category",
    categoryResultSchema,
    "更新租户目录分类失败",
    {
      p_category_id: input.category_id,
      p_tenant_id: input.tenant_id,
      p_name: input.name,
      p_mapped_platform_category_id: input.mapped_platform_category_id ?? null,
      p_expected_version: input.expected_version,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: crypto.randomUUID(),
    },
  );
}

export function createTenantBrand(
  client: CatalogClient,
  input: TenantCatalogBrandCreateRecord,
): Promise<TenantCatalogBrand> {
  return callTenantCatalogCommand(
    client,
    "create_tenant_catalog_brand",
    "brand",
    brandResultSchema,
    "新增租户目录品牌失败",
    {
      p_brand_id: input.brand_id,
      p_tenant_id: input.tenant_id,
      p_code: input.code,
      p_name: input.name,
      p_mapped_platform_brand_id: input.mapped_platform_brand_id ?? null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    },
  );
}

export function updateTenantBrand(
  client: CatalogClient,
  input: TenantCatalogBrandUpdateRecord,
): Promise<TenantCatalogBrand> {
  return callTenantCatalogCommand(
    client,
    "update_tenant_catalog_brand",
    "brand",
    brandResultSchema,
    "更新租户目录品牌失败",
    {
      p_brand_id: input.brand_id,
      p_tenant_id: input.tenant_id,
      p_name: input.name,
      p_mapped_platform_brand_id: input.mapped_platform_brand_id ?? null,
      p_expected_version: input.expected_version,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: crypto.randomUUID(),
    },
  );
}

type SpecDefinitionInput = {
  spec_id: string;
  category_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
  code: string;
  name: string;
  value_type: string;
  required: boolean;
  enum_options: string[];
  unit_dimension?: string | null;
  participates_in_sku_name: boolean;
  filterable: boolean;
  sort_order: number;
};

type SpecDefinitionUpdateInput = {
  spec_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  expected_version: number;
  name?: string;
  required?: boolean;
  enum_options?: string[];
  unit_dimension?: string | null;
  participates_in_sku_name?: boolean;
  filterable?: boolean;
  sort_order?: number;
};

export async function findSpecDefinitionOwnership(
  client: CatalogClient,
  specId: string,
): Promise<CatalogOwnership | null> {
  const { data, error } = await client.from("catalog_spec_definitions")
    .select("ownership_scope, owner_tenant_id")
    .eq("id", specId)
    .maybeSingle();
  if (error) throw Errors.dbError("查询规格定义失败", error);
  if (data === null) return null;
  return {
    ownershipScope: data.ownership_scope as "platform" | "tenant",
    ownerTenantId: data.owner_tenant_id,
  };
}

export async function listSpecDefinitions(
  client: CatalogClient,
  categoryId: string,
  tenantId: string,
  query: { page: number; pageSize: number; keyword?: string; status?: string },
) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let request = client.from("catalog_spec_definitions")
    .select("*", { count: "exact" })
    .eq("category_id", categoryId)
    .or(`ownership_scope.eq.platform,owner_tenant_id.eq.${tenantId}`);
  if (query.status) request = request.eq("status", query.status);
  if (query.keyword) request = request.ilike("name", `%${query.keyword}%`);
  const { data, error, count } = await request
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range(start, end);
  if (error) throw Errors.dbError("查询规格定义失败", error);
  return {
    list: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export async function createSpecDefinition(
  client: CatalogClient,
  input: SpecDefinitionInput,
) {
  const { data, error } = await client.from("catalog_spec_definitions")
    .insert({
      id: input.spec_id,
      category_id: input.category_id,
      code: input.code,
      name: input.name,
      value_type: input.value_type,
      required: input.required,
      enum_options: input.enum_options,
      unit_dimension: input.unit_dimension ?? null,
      participates_in_sku_name: input.participates_in_sku_name,
      filterable: input.filterable,
      sort_order: input.sort_order,
      ownership_scope: "tenant",
      owner_tenant_id: input.tenant_id,
      status: "active",
      version: 1,
      created_by_employee_id: input.actor_employee_id,
      updated_by_employee_id: input.actor_employee_id,
    })
    .select()
    .single();
  if (error) throw Errors.dbError("新增规格定义失败", error);
  return data;
}

export async function updateSpecDefinition(
  client: CatalogClient,
  input: SpecDefinitionUpdateInput,
) {
  const { spec_id, expected_version, actor_employee_id, ...patch } = input;
  const { data, error } = await client.from("catalog_spec_definitions")
    .update({
      ...patch,
      version: expected_version + 1,
      updated_by_employee_id: actor_employee_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", spec_id)
    .eq("version", expected_version)
    .select()
    .single();
  if (error) throw Errors.dbError("更新规格定义失败", error);
  return data;
}

export async function copyPlatformSpecs(
  client: CatalogClient,
  input: {
    target_category_id: string;
    tenant_id: string;
    actor_user_id: string;
    actor_employee_id: string;
    idempotency_key: string;
  },
) {
  const { data, error } = await client.rpc("copy_platform_category_specs", {
    p_target_category_id: input.target_category_id,
    p_tenant_id: input.tenant_id,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw Errors.dbError("复制平台规格失败", error);
  return data;
}

export async function submitUnitSuggestion(
  client: CatalogClient,
  input: {
    tenant_id: string;
    name: string;
    symbol: string;
    dimension: string;
    note: string | null;
    actor_user_id: string;
    actor_employee_id: string;
    idempotency_key: string;
  },
) {
  const { data, error } = await client.rpc("submit_catalog_unit_suggestion", {
    p_tenant_id: input.tenant_id,
    p_name: input.name,
    p_symbol: input.symbol,
    p_dimension: input.dimension,
    p_note: input.note ?? null,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw Errors.dbError("提交单位建议失败", error);
  return data;
}

export async function listUnitSuggestions(
  client: CatalogClient,
  tenantId: string | null,
  query: { page: number; pageSize: number; status?: string },
) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let request = client.from("catalog_unit_suggestions")
    .select("*", { count: "exact" });
  if (tenantId) request = request.eq("tenant_id", tenantId);
  if (query.status) request = request.eq("status", query.status);
  const { data, error, count } = await request
    .order("created_at", { ascending: false })
    .range(start, end);
  if (error) throw Errors.dbError("查询单位建议失败", error);
  return {
    list: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}
