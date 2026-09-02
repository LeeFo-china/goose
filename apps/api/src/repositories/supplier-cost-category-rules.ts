import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  SupplierCostCategoryOptionQuery,
  SupplierCostCategoryRuleListQuery,
  SupplierCostCategoryRuleScope,
} from "@/schema/supplier-cost-category-rules";
import { SupabaseDB } from "@/utils/supabase";

const CostCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
}).strict();

const RuleSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  rule_scope: z.enum(["category", "product"]),
  catalog_category_id: z.uuid().nullable(),
  supplier_product_id: z.uuid().nullable(),
  cost_category_id: z.uuid(),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const VisibleRecordSchema = z.object({ id: z.uuid() }).strict();

type Result = { data: unknown; error: { code?: string } | null; count: number | null };
type SingleResult = { data: unknown; error: { code?: string } | null };
type Query = {
  select: (...args: unknown[]) => Query;
  insert: (value: object) => Query;
  update: (value: object) => Query;
  delete: () => Query;
  eq: (column: string, value: unknown) => Query;
  ilike: (column: string, pattern: string) => Query;
  is: (column: string, value: null) => Query;
  or: (filters: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Promise<Result>;
  maybeSingle: () => Promise<SingleResult>;
};
type Client = { from: (table: string) => Query };

export type SupplierCostCategoryRule = z.infer<typeof RuleSchema>;
export type SupplierCostCategoryOption = z.infer<typeof CostCategorySchema>;

function pagination(query: { page: number; pageSize: number }) {
  const pageSize = Math.min(query.pageSize, 100);
  return {
    page: query.page,
    pageSize,
    from: (query.page - 1) * pageSize,
    to: query.page * pageSize - 1,
  };
}

function parseOne<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

function parseMany<T>(schema: z.ZodType<T>, data: unknown, message: string): T[] {
  const parsed = z.array(schema).safeParse(data ?? []);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

export class SupplierCostCategoryRulesRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listCostCategories(
    tenantId: string,
    query: SupplierCostCategoryOptionQuery,
  ) {
    const page = pagination(query);
    let request = this.client.from("finance_cost_categories")
      .select("id,name", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    if (query.keyword) request = request.ilike("name", `%${query.keyword}%`);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .range(page.from, page.to);
    if (error) throw Errors.dbError("查询成本分类选项失败", error);
    return {
      list: parseMany(CostCategorySchema, data, "查询成本分类选项失败"),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / page.pageSize) : 0,
      },
    };
  }

  async listRules(tenantId: string, query: SupplierCostCategoryRuleListQuery) {
    const page = pagination(query);
    let request = this.client.from("tenant_catalog_cost_category_rules")
      .select(
        "id,tenant_id,rule_scope,catalog_category_id,supplier_product_id,cost_category_id,version,created_at,updated_at",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);
    if (query.scope) request = request.eq("rule_scope", query.scope);
    if (query.targetId && query.scope) {
      request = request.eq(
        query.scope === "category" ? "catalog_category_id" : "supplier_product_id",
        query.targetId,
      );
    }
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .range(page.from, page.to);
    if (error) throw Errors.dbError("查询商品成本归类规则失败", error);
    return {
      list: parseMany(RuleSchema, data, "查询商品成本归类规则失败"),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / page.pageSize) : 0,
      },
    };
  }

  findActiveCostCategory(tenantId: string, id: string) {
    return this.findVisible(
      "finance_cost_categories",
      id,
      (request) => request.eq("tenant_id", tenantId).eq("status", "active"),
    );
  }

  findVisibleCategory(tenantId: string, id: string) {
    return this.findVisible("catalog_categories", id, (request) => request.or(
      "and(ownership_scope.eq.platform,owner_tenant_id.is.null)," +
        `and(ownership_scope.eq.tenant,owner_tenant_id.eq.${tenantId})`,
    ));
  }

  findVisibleProduct(tenantId: string, id: string) {
    return this.findVisible("supplier_products", id, (request) => request.or(
      "and(ownership_scope.eq.platform,owner_tenant_id.is.null)," +
        `and(ownership_scope.eq.tenant,owner_tenant_id.eq.${tenantId})`,
    ));
  }

  async findRule(
    tenantId: string,
    scope: SupplierCostCategoryRuleScope,
    targetId: string,
  ): Promise<SupplierCostCategoryRule | null> {
    const { data, error } = await this.client
      .from("tenant_catalog_cost_category_rules")
      .select("id,tenant_id,rule_scope,catalog_category_id,supplier_product_id,cost_category_id,version,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .eq("rule_scope", scope)
      .eq(scope === "category" ? "catalog_category_id" : "supplier_product_id", targetId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询商品成本归类规则失败", error);
    return data ? parseOne(RuleSchema, data, "查询商品成本归类规则失败") : null;
  }

  async saveRule(input: {
    tenantId: string;
    employeeId: string;
    scope: SupplierCostCategoryRuleScope;
    targetId: string;
    costCategoryId: string;
    currentRuleId: string | null;
    expectedVersion: number;
  }): Promise<SupplierCostCategoryRule> {
    const values = {
      tenant_id: input.tenantId,
      rule_scope: input.scope,
      catalog_category_id: input.scope === "category" ? input.targetId : null,
      supplier_product_id: input.scope === "product" ? input.targetId : null,
      cost_category_id: input.costCategoryId,
      updated_by_employee_id: input.employeeId,
    };
    let request = input.currentRuleId
      ? this.client.from("tenant_catalog_cost_category_rules")
        .update(values)
        .eq("id", input.currentRuleId)
        .eq("tenant_id", input.tenantId)
        .eq("version", input.expectedVersion)
      : this.client.from("tenant_catalog_cost_category_rules").insert({
        ...values,
        created_by_employee_id: input.employeeId,
      });
    const { data, error } = await request
      .select("id,tenant_id,rule_scope,catalog_category_id,supplier_product_id,cost_category_id,version,created_at,updated_at")
      .maybeSingle();
    if (error?.code === "23505") {
      throw Errors.business(409, "成本归类规则已发生变化，请刷新后重试", "SUPPLIER_COST_CATEGORY_RULE_VERSION_CONFLICT");
    }
    if (error) throw Errors.dbError("保存商品成本归类规则失败", error);
    if (!data) {
      throw Errors.business(409, "成本归类规则已发生变化，请刷新后重试", "SUPPLIER_COST_CATEGORY_RULE_VERSION_CONFLICT");
    }
    return parseOne(RuleSchema, data, "保存商品成本归类规则失败");
  }

  async deleteRule(input: {
    tenantId: string;
    ruleId: string;
    expectedVersion: number;
  }): Promise<boolean> {
    const { data, error } = await this.client
      .from("tenant_catalog_cost_category_rules")
      .delete()
      .eq("id", input.ruleId)
      .eq("tenant_id", input.tenantId)
      .eq("version", input.expectedVersion)
      .select("id")
      .maybeSingle();
    if (error) throw Errors.dbError("删除商品成本归类规则失败", error);
    return Boolean(data);
  }

  private async findVisible(
    table: string,
    id: string,
    scope: (request: Query) => Query,
  ): Promise<{ id: string } | null> {
    const { data, error } = await scope(this.client.from(table).select("id").eq("id", id))
      .maybeSingle();
    if (error) throw Errors.dbError("核验商品成本归类目标失败", error);
    return data ? parseOne(VisibleRecordSchema, data, "核验商品成本归类目标失败") : null;
  }
}

export const supplierCostCategoryRulesRepository =
  new SupplierCostCategoryRulesRepository();
