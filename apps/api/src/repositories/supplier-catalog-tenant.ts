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

