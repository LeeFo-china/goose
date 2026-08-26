import type {
  CatalogBrandUpdateRecord,
  CatalogCategoryUpdateRecord,
  CatalogUnitUpdateRecord,
} from "@/schema/supplier-catalog";
import type {
  CatalogBrandCreateCommand,
  CatalogCategoryCreateCommand,
  CatalogUnitCreateCommand,
} from "@/schema/supplier-create-commands";
import {
  executeCreateCommand,
  rpcCommandContext,
} from "./supplier-create-command-rpc";
import {
  BRAND_SELECT,
  CatalogBrandSchema,
  CatalogCategorySchema,
  CatalogUnitSchema,
  CATEGORY_SELECT,
  PlatformBrandSchema,
  PlatformCategorySchema,
  UNIT_SELECT,
} from "./supplier-catalog-models";
import type { CatalogClient } from "./supplier-catalog-read";
import { Errors } from "@/errors/error-factory";
import { compact, parseRow } from "./supplier-catalog-models";
import { executeCatalogResourceCommand } from "./supplier-catalog-command-rpc";
import { z } from "zod";

const ConflictSnapshotSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["active", "inactive"]),
}).strict();

export type CatalogActorCommand = {
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type TenantCatalogCommand = CatalogActorCommand & {
  tenant_id: string;
};
export type TenantCategoryCreateCommand = TenantCatalogCommand & {
  category_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  status: "active" | "inactive";
  sort_order: number;
  mapped_platform_category_id: string | null;
};
export type TenantCategoryUpdateCommand = TenantCategoryCreateCommand & {
  expected_version: number;
};
export type TenantBrandCreateCommand = TenantCatalogCommand & {
  brand_id: string;
  category_id: string | null;
  code: string;
  name: string;
  legal_name?: string | null;
  logo_file_id?: string | null;
  status: "active" | "inactive";
  sort_order: number;
  mapped_platform_brand_id: string | null;
};
export type TenantBrandUpdateCommand = TenantBrandCreateCommand & {
  expected_version: number;
};

export class SupplierCatalogCommandRepository {
  constructor(private readonly client: CatalogClient) {}

  createCategory(input: CatalogCategoryCreateCommand) {
    return executeCreateCommand({
      client: this.client,
      functionName: "create_catalog_category",
      resourceKey: "category",
      resourceSchema: PlatformCategorySchema,
      message: "新增标准目录分类失败",
      params: {
        p_category_id: input.category_id,
        p_parent_id: input.parent_id,
        p_code: input.code,
        p_name: input.name,
        p_level: input.level,
        p_status: input.status,
        p_sort_order: input.sort_order,
        ...rpcCommandContext(input),
      },
    });
  }

  createBrand(input: CatalogBrandCreateCommand) {
    return executeCreateCommand({
      client: this.client,
      functionName: "create_catalog_brand",
      resourceKey: "brand",
      resourceSchema: PlatformBrandSchema,
      message: "新增标准品牌失败",
      params: {
        p_brand_id: input.brand_id,
        p_code: input.code,
        p_name: input.name,
        p_legal_name: input.legal_name ?? null,
        p_logo_file_id: input.logo_file_id ?? null,
        p_status: input.status,
        p_sort_order: input.sort_order,
        ...rpcCommandContext(input),
      },
    });
  }

  createUnit(input: CatalogUnitCreateCommand) {
    return executeCreateCommand({
      client: this.client,
      functionName: "create_catalog_unit",
      resourceKey: "unit",
      resourceSchema: CatalogUnitSchema,
      message: "新增标准单位失败",
      params: {
        p_unit_id: input.unit_id,
        p_code: input.code,
        p_name: input.name,
        p_symbol: input.symbol,
        p_base_unit_id: input.base_unit_id,
        p_conversion_factor: input.conversion_factor,
        p_unit_dimension: input.unit_dimension,
        p_status: input.status,
        p_sort_order: input.sort_order,
        ...rpcCommandContext(input),
      },
    });
  }

  updateCategory(input: CatalogCategoryUpdateRecord) {
    const { category_id, expected_version, ...patch } = input;
    return this.updatePlatformRow(
      "catalog_categories", CATEGORY_SELECT, category_id, expected_version,
      patch, CatalogCategorySchema, "更新标准目录分类失败",
    );
  }

  updateBrand(input: CatalogBrandUpdateRecord) {
    const { brand_id, expected_version, ...patch } = input;
    return this.updatePlatformRow(
      "catalog_brands", BRAND_SELECT, brand_id, expected_version,
      patch, CatalogBrandSchema, "更新标准品牌失败",
    );
  }

  updateUnit(input: CatalogUnitUpdateRecord) {
    const { unit_id, expected_version, ...patch } = input;
    return this.updatePlatformRow(
      "catalog_units", UNIT_SELECT, unit_id, expected_version,
      patch, CatalogUnitSchema, "更新标准单位失败",
    );
  }

  createTenantCategory(input: TenantCategoryCreateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "create_tenant_catalog_category",
      expectedStatus: "created",
      resourceKey: "catalog_category",
      resourceSchema: CatalogCategorySchema,
      message: "新增租户目录分类失败",
      params: categoryParams(input),
    });
  }

  updateTenantCategory(input: TenantCategoryUpdateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "update_tenant_catalog_category",
      expectedStatus: "updated",
      resourceKey: "catalog_category",
      resourceSchema: CatalogCategorySchema,
      message: "更新租户目录分类失败",
      params: {
        ...categoryParams(input),
        p_expected_version: input.expected_version,
      },
    });
  }

  createTenantBrand(input: TenantBrandCreateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "create_tenant_catalog_brand",
      expectedStatus: "created",
      resourceKey: "catalog_brand",
      resourceSchema: CatalogBrandSchema,
      message: "新增租户目录品牌失败",
      params: brandParams(input),
    });
  }

  updateTenantBrand(input: TenantBrandUpdateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "update_tenant_catalog_brand",
      expectedStatus: "updated",
      resourceKey: "catalog_brand",
      resourceSchema: CatalogBrandSchema,
      message: "更新租户目录品牌失败",
      params: {
        ...brandParams(input),
        p_expected_version: input.expected_version,
      },
    });
  }

  private async updatePlatformRow<Output>(
    table: string,
    select: string,
    id: string,
    expectedVersion: number,
    patch: object,
    schema: Parameters<typeof parseRow<Output>>[0],
    message: string,
  ): Promise<Output> {
    const { data, error } = await this.client.from(table)
      .update(compact({ ...patch, version: expectedVersion + 1 }))
      .eq("id", id)
      .eq("version", expectedVersion)
      .eq("ownership_scope", "platform")
      .is("owner_tenant_id", null)
      .select(select)
      .maybeSingle();
    if (error) throw Errors.dbError(message, error);
    if (data === null) {
      const conflict = await this.readPlatformConflict(table, id);
      throw Errors.business(
        409,
        "目录数据版本已变化，请刷新后重试",
        "SUPPLIER_VERSION_CONFLICT",
        conflict
          ? {
              current_version: conflict.version,
              current_status: conflict.status,
            }
          : undefined,
      );
    }
    return parseRow(schema, data, message);
  }

  private async readPlatformConflict(table: string, id: string) {
    const { data, error } = await this.client.from(table)
      .select("version,status")
      .eq("id", id)
      .eq("ownership_scope", "platform")
      .is("owner_tenant_id", null)
      .maybeSingle();
    if (error) throw Errors.dbError("刷新目录数据版本失败", error);
    return data === null
      ? null
      : parseRow(ConflictSnapshotSchema, data, "刷新目录数据版本失败");
  }
}

function commandContext(input: TenantCatalogCommand) {
  return {
    p_tenant_id: input.tenant_id,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

function categoryParams(input: TenantCategoryCreateCommand) {
  return {
    p_category_id: input.category_id,
    p_parent_id: input.parent_id,
    p_code: input.code,
    p_name: input.name,
    p_status: input.status,
    p_sort_order: input.sort_order,
    p_mapped_platform_category_id: input.mapped_platform_category_id,
    ...commandContext(input),
  };
}

function brandParams(input: TenantBrandCreateCommand) {
  return {
    p_brand_id: input.brand_id,
    p_category_id: input.category_id,
    p_code: input.code,
    p_name: input.name,
    p_legal_name: input.legal_name ?? null,
    p_logo_file_id: input.logo_file_id ?? null,
    p_status: input.status,
    p_sort_order: input.sort_order,
    p_mapped_platform_brand_id: input.mapped_platform_brand_id,
    ...commandContext(input),
  };
}
