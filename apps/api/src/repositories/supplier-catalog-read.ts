import { Errors } from "@/errors/error-factory";
import type {
  CatalogBrandListQuery,
  CatalogCategoryListQuery,
  CatalogSpecDefinitionListQuery,
  CatalogUnitListQuery,
} from "@/schema/supplier-catalog";
import { SupabaseDB } from "@/utils/supabase";
import {
  BRAND_MAPPING_SELECT,
  BRAND_SELECT,
  CATEGORY_MAPPING_SELECT,
  CATEGORY_SELECT,
  CatalogBrandSchema,
  CatalogBrandSummarySchema,
  CatalogCategorySchema,
  CatalogCategorySummarySchema,
  CatalogSpecDefinitionSchema,
  CatalogUnitBaseSchema,
  CatalogUnitListSchema,
  CatalogUnitSchema,
  SPEC_SELECT,
  UNIT_BASE_SELECT,
  UNIT_SELECT,
  applyKeyword,
  applyListVisibility,
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
    request = applyListVisibility(request, visibility, input.status);
    if (input.parent_id) {
      request = request.eq("parent_id", input.parent_id);
    } else if (input.parent_id === null || input.is_leaf !== true) {
      request = request.is("parent_id", null);
    }
    if (input.level) request = request.eq("level", input.level);
    if (input.is_leaf !== undefined) {
      request = request.eq("is_leaf", input.is_leaf);
    }
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商目录分类失败", error);
    const categories = parseRows(
      CatalogCategorySchema,
      data,
      "查询供应商目录分类失败",
    );
    return toPage(
      await this.hydrateMappedCategories(categories),
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
    request = applyListVisibility(request, visibility, input.status);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询供应商目录品牌失败", error);
    const brands = parseRows(
      CatalogBrandSchema,
      data,
      "查询供应商目录品牌失败",
    );
    return toPage(
      await this.hydrateMappedBrands(brands),
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
    request = applyListVisibility(request, visibility, input.status);
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

  async findVisibleCategory(id: string, visibility: CatalogVisibility) {
    const category = await this.findVisibleRow(
      "catalog_categories", CATEGORY_SELECT, id, visibility,
      CatalogCategorySchema, "查询目录分类失败",
    );
    if (category === null) return null;
    const hydrated = await this.hydrateMappedCategories([category]);
    return hydrated[0] ?? null;
  }

  async findVisibleBrand(id: string, visibility: CatalogVisibility) {
    const brand = await this.findVisibleRow(
      "catalog_brands", BRAND_SELECT, id, visibility,
      CatalogBrandSchema, "查询目录品牌失败",
    );
    if (brand === null) return null;
    const hydrated = await this.hydrateMappedBrands([brand]);
    return hydrated[0] ?? null;
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

  private async hydrateMappedCategories(
    categories: CatalogCategory[],
  ): Promise<CatalogCategory[]> {
    const ids = Array.from(new Set(
      categories.flatMap((category) =>
        category.mapped_platform_category_id
          ? [category.mapped_platform_category_id]
          : []
      ),
    ));
    if (ids.length === 0) {
      return categories.map((category) => ({
        ...category,
        mapped_platform_category: null,
      }));
    }
    const { data, error } = await this.client.from("catalog_categories")
      .select(CATEGORY_MAPPING_SELECT)
      .in("id", ids)
      .limit(ids.length);
    if (error) throw Errors.dbError("查询供应商目录分类失败", error);
    const mapped = parseRows(
      CatalogCategorySummarySchema,
      data,
      "查询供应商目录分类失败",
    );
    const byId = new Map(mapped.map((category) => [category.id, category]));
    return categories.map((category) => ({
      ...category,
      mapped_platform_category: category.mapped_platform_category_id
        ? byId.get(category.mapped_platform_category_id) ?? null
        : null,
    }));
  }

  private async hydrateMappedBrands(
    brands: CatalogBrand[],
  ): Promise<CatalogBrand[]> {
    const ids = Array.from(new Set(
      brands.flatMap((brand) =>
        brand.mapped_platform_brand_id ? [brand.mapped_platform_brand_id] : []
      ),
    ));
    if (ids.length === 0) {
      return brands.map((brand) => ({
        ...brand,
        mapped_platform_brand: null,
      }));
    }
    const { data, error } = await this.client.from("catalog_brands")
      .select(BRAND_MAPPING_SELECT)
      .in("id", ids)
      .limit(ids.length);
    if (error) throw Errors.dbError("查询供应商目录品牌失败", error);
    const mapped = parseRows(
      CatalogBrandSummarySchema,
      data,
      "查询供应商目录品牌失败",
    );
    const byId = new Map(mapped.map((brand) => [brand.id, brand]));
    return brands.map((brand) => ({
      ...brand,
      mapped_platform_brand: brand.mapped_platform_brand_id
        ? byId.get(brand.mapped_platform_brand_id) ?? null
        : null,
    }));
  }
}
