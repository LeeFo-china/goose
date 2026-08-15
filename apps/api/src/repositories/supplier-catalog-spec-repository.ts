import { Errors } from "@/errors/error-factory";
import type { CatalogOwnership } from "@/schema/supplier-catalog";
import type { SupabaseDB } from "@/utils/supabase";

type CatalogClient = ReturnType<typeof SupabaseDB.getAdminClient>;

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

function specUpdatePatch(input: SpecDefinitionUpdateInput) {
  const patch: Record<string, unknown> = {
    version: input.expected_version + 1,
    updated_by_employee_id: input.actor_employee_id,
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.required !== undefined) patch.required = input.required;
  if (input.enum_options !== undefined) patch.enum_options = input.enum_options;
  if (input.unit_dimension !== undefined) {
    patch.unit_dimension = input.unit_dimension;
  }
  if (input.participates_in_sku_name !== undefined) {
    patch.participates_in_sku_name = input.participates_in_sku_name;
  }
  if (input.filterable !== undefined) patch.filterable = input.filterable;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  return patch;
}

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
  const { data, error } = await client.from("catalog_spec_definitions")
    .update(specUpdatePatch(input))
    .eq("id", input.spec_id)
    .eq("version", input.expected_version)
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

export async function listPlatformSpecDefinitions(
  client: CatalogClient,
  categoryId: string,
  query: { page: number; pageSize: number; keyword?: string; status?: string },
) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let request = client.from("catalog_spec_definitions")
    .select("*", { count: "exact" })
    .eq("category_id", categoryId)
    .eq("ownership_scope", "platform");
  if (query.status) request = request.eq("status", query.status);
  if (query.keyword) request = request.ilike("name", `%${query.keyword}%`);
  const { data, error, count } = await request
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range(start, end);
  if (error) throw Errors.dbError("查询平台规格定义失败", error);
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

export async function createPlatformSpecDefinition(
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
      ownership_scope: "platform",
      owner_tenant_id: null,
      status: "active",
      version: 1,
      created_by_employee_id: input.actor_employee_id,
      updated_by_employee_id: input.actor_employee_id,
    })
    .select()
    .single();
  if (error) throw Errors.dbError("新增平台规格定义失败", error);
  return data;
}

export async function updatePlatformSpecDefinition(
  client: CatalogClient,
  input: SpecDefinitionUpdateInput,
) {
  const { data, error } = await client.from("catalog_spec_definitions")
    .update(specUpdatePatch(input))
    .eq("id", input.spec_id)
    .eq("ownership_scope", "platform")
    .eq("version", input.expected_version)
    .select()
    .single();
  if (error) throw Errors.dbError("更新平台规格定义失败", error);
  return data;
}

export async function processUnitSuggestion(
  client: CatalogClient,
  input: {
    suggestion_id: string;
    status: "approved" | "rejected";
    actor_user_id: string;
    actor_employee_id: string;
  },
) {
  const { data, error } = await client.from("catalog_unit_suggestions")
    .update({
      status: input.status,
      processed_by_employee_id: input.actor_employee_id,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.suggestion_id)
    .select()
    .single();
  if (error) throw Errors.dbError("处理单位建议失败", error);
  return data;
}
