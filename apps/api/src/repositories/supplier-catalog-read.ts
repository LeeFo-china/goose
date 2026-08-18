import { Errors } from "@/errors/error-factory";
import type {
  CatalogBrandListQuery,
  CatalogCategoryListQuery,
  CatalogSpecDefinitionListQuery,
  CatalogUnitListQuery,
} from "@/schema/supplier-catalog";
import { SupabaseDB } from "@/utils/supabase";
import {
  BRAND_SELECT,
  CATEGORY_SELECT,
  CatalogBrandSchema,
  CatalogCategorySchema,
  CatalogSpecDefinitionSchema,
  CatalogUnitBaseSchema,
  CatalogUnitListSchema,
  CatalogUnitSchema,
  SPEC_SELECT,
  UNIT_BASE_SELECT,
  UNIT_SELECT,
  applyKeyword,
  applyVisibility,
  normalizePage,
  pageRange,
  parseRow,
  parseRows,
  toPage,
  type CatalogBrand,
  type CatalogCategory,
  type CatalogPage,
  type CatalogSpecDefinition,
  type CatalogUnit,
  type CatalogUnitRecord,
  type CatalogVisibility,
} from "./supplier-catalog-models";

export type CatalogClient = ReturnType<typeof SupabaseDB.getAdminClient>;

export class SupplierCatalogReadRepository {
  constructor(private readonly client: CatalogClient) {}

  async listCategories(
    input: CatalogCategoryListQuery,
    visibility: CatalogVisibility = { kind: "platform" },
  ): Promise<CatalogPage<CatalogCategory>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_categories")
      .select(CATEGORY_SELECT, { count: "exact" });
    request = applyVisibility(request, visibility);
    request = input.parent_id
      ? request.eq("parent_id", input.parent_id)
      : request.is("parent_id", null);
    if (input.status) request = request.eq("status", input.status);
    if (input.level) request = request.eq("level", input.level);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商目录分类失败", error);
    return toPage(
      parseRows(CatalogCategorySchema, data, "查询供应商目录分类失败"),
      pagination,
      count,
    );
  }

  async listBrands(
    input: CatalogBrandListQuery,
    visibility: CatalogVisibility = { kind: "platform" },
  ): Promise<CatalogPage<CatalogBrand>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_brands")
      .select(BRAND_SELECT, { count: "exact" });
    request = applyVisibility(request, visibility);
    if (input.status) request = request.eq("status", input.status);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商目录品牌失败", error);
    return toPage(
      parseRows(CatalogBrandSchema, data, "查询供应商目录品牌失败"),
      pagination,
      count,
    );
  }

  async listUnits(
    input: CatalogUnitListQuery,
  ): Promise<CatalogPage<CatalogUnit>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_units")
      .select(UNIT_SELECT, { count: "exact" });
    if (input.status) request = request.eq("status", input.status);
    if (input.base_unit_id === null || input.unit_kind === "base") {
      request = request.is("base_unit_id", null);
    } else if (input.base_unit_id) {
      request = request.eq("base_unit_id", input.base_unit_id);
    } else if (input.unit_kind === "derived") {
      request = request.not("base_unit_id", "is", null);
    }
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询标准单位失败", error);
    const units = parseRows(CatalogUnitSchema, data, "查询标准单位失败");
    return toPage(await this.hydrateBaseUnits(units), pagination, count);
  }

  async listSpecDefinitions(
    categoryId: string,
    input: CatalogSpecDefinitionListQuery,
    visibility: CatalogVisibility,
  ): Promise<CatalogPage<CatalogSpecDefinition>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_spec_definitions")
      .select(SPEC_SELECT, { count: "exact" })
      .eq("category_id", categoryId);
    request = applyVisibility(request, visibility);
    if (input.status) request = request.eq("status", input.status);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询目录规格定义失败", error);
    return toPage(
      parseRows(CatalogSpecDefinitionSchema, data, "查询目录规格定义失败"),
      pagination,
      count,
    );
  }

  findVisibleCategory(id: string, visibility: CatalogVisibility) {
    return this.findVisibleRow(
      "catalog_categories", CATEGORY_SELECT, id, visibility,
      CatalogCategorySchema, "查询目录分类失败",
    );
  }

  findVisibleBrand(id: string, visibility: CatalogVisibility) {
    return this.findVisibleRow(
      "catalog_brands", BRAND_SELECT, id, visibility,
      CatalogBrandSchema, "查询目录品牌失败",
    );
  }

  async findVisibleSpecDefinition(
    categoryId: string,
    definitionId: string,
    visibility: CatalogVisibility,
  ) {
    let request = this.client.from("catalog_spec_definitions")
      .select(SPEC_SELECT)
      .eq("id", definitionId)
      .eq("category_id", categoryId);
    request = applyVisibility(request, visibility);
    const { data, error } = await request.maybeSingle();
    if (error) throw Errors.dbError("查询目录规格定义失败", error);
    return data === null
      ? null
      : parseRow(CatalogSpecDefinitionSchema, data, "查询目录规格定义失败");
  }

  private async findVisibleRow<Output>(
    table: string,
    select: string,
    id: string,
    visibility: CatalogVisibility,
    schema: Parameters<typeof parseRow<Output>>[0],
    message: string,
  ): Promise<Output | null> {
    let request = this.client.from(table).select(select).eq("id", id);
    request = applyVisibility(request, visibility);
    const { data, error } = await request.maybeSingle();
    if (error) throw Errors.dbError(message, error);
    return data === null ? null : parseRow(schema, data, message);
  }

  private async hydrateBaseUnits(
    units: CatalogUnitRecord[],
  ): Promise<CatalogUnit[]> {
    const ids = Array.from(new Set(
      units.flatMap((unit) => unit.base_unit_id ? [unit.base_unit_id] : []),
    ));
    if (ids.length === 0) {
      return units.map((unit) => ({ ...unit, base_unit: null }));
    }
    const { data, error } = await this.client.from("catalog_units")
      .select(UNIT_BASE_SELECT)
      .in("id", ids)
      .limit(ids.length);
    if (error) throw Errors.dbError("查询标准单位失败", error);
    const bases = parseRows(CatalogUnitBaseSchema, data, "查询标准单位失败");
    const byId = new Map(bases.map((unit) => [unit.id, unit]));
    return units.map((unit) => ({
      ...unit,
      base_unit: unit.base_unit_id
        ? byId.get(unit.base_unit_id) ?? null
        : null,
    }));
  }
}
