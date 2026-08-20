import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const ACTIVE_VERSION_SELECT = [
  "id",
  "tenant_id",
  "version_no",
  "effective_from",
  "effective_to",
  "currency",
  "disclaimer",
].join(",");
const PRICING_ITEM_SELECT = [
  "id",
  "pricing_version_id",
  "category_code",
  "item_code",
  "label",
  "unit",
  "minimum_amount",
  "maximum_amount",
  "condition_payload",
  "sort_order",
].join(",");
const INSERTED_ESTIMATE_SELECT = [
  "id",
  "estimate_no",
  "tenant_id",
  "douyin_miniapp_installation_id",
  "pricing_version_id",
  "ai_status",
].join(",");
const MAX_PRICING_ITEMS = 100;

const DatabaseDateTimeSchema = z.iso.datetime({ offset: true });
const ActiveVersionSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  version_no: z.int().min(1),
  effective_from: DatabaseDateTimeSchema,
  effective_to: DatabaseDateTimeSchema.nullable(),
  currency: z.literal("CNY"),
  disclaimer: z.string().trim().min(1).max(500),
});
const PricingItemSchema = z.strictObject({
  id: z.uuid(),
  pricing_version_id: z.uuid(),
  category_code: z.string().trim().min(1),
  item_code: z.string().trim().min(1),
  label: z.string().trim().min(1).max(40),
  unit: z.string().trim().min(1),
  minimum_amount: z.int().nonnegative(),
  maximum_amount: z.int().nonnegative(),
  condition_payload: z.unknown(),
  sort_order: z.int().nonnegative(),
});
const InsertedEstimateSchema = z.strictObject({
  id: z.uuid(),
  estimate_no: z.string().regex(/^DYYS-\d{8}-\d{6}$/),
  tenant_id: z.uuid(),
  douyin_miniapp_installation_id: z.uuid(),
  pricing_version_id: z.uuid(),
  ai_status: z.literal("pending"),
});

export type DouyinBudgetPricingVersionRecord = z.infer<
  typeof ActiveVersionSchema
>;
export type DouyinBudgetPricingItemRecord = z.infer<typeof PricingItemSchema>;
export type DouyinBudgetInsertedEstimate = z.infer<
  typeof InsertedEstimateSchema
>;

export type DouyinBudgetDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface DouyinBudgetQuery
  extends PromiseLike<DouyinBudgetDatabaseResult> {
  select(columns: string, options?: Record<string, unknown>): DouyinBudgetQuery;
  eq(column: string, value: unknown): DouyinBudgetQuery;
  gte(column: string, value: unknown): DouyinBudgetQuery;
  lte(column: string, value: unknown): DouyinBudgetQuery;
  or(filters: string): DouyinBudgetQuery;
  order(column: string, options: Record<string, unknown>): DouyinBudgetQuery;
  limit(count: number): DouyinBudgetQuery;
  insert(rows: readonly Record<string, unknown>[]): DouyinBudgetQuery;
  single(): Promise<DouyinBudgetDatabaseResult>;
}

export interface DouyinBudgetDatabaseClient {
  from(table: string): DouyinBudgetQuery;
}

export interface InsertDouyinBudgetEstimateInput {
  readonly id: string;
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
  readonly requestIpHash: string;
  readonly pricingVersionId: string;
  readonly estimateNo: string;
  readonly requestPayload: Record<string, unknown>;
  readonly resultPayload: Record<string, unknown>;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export class DouyinBudgetRepository {
  constructor(
    private readonly client: DouyinBudgetDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinBudgetDatabaseClient,
  ) {}

  async loadActivePricing(input: { readonly tenantId: string; readonly now: string }) {
    return execute(async () => {
      const versionResult = await this.client
        .from("douyin_budget_pricing_versions")
        .select(ACTIVE_VERSION_SELECT)
        .eq("tenant_id", input.tenantId)
        .eq("status", "active")
        .lte("effective_from", input.now)
        .or(`effective_to.is.null,effective_to.gt.${input.now}`)
        .order("effective_from", { ascending: false })
        .order("id", { ascending: true })
        .limit(2);
      assertDatabaseSuccess(versionResult);
      const versions = z.array(ActiveVersionSchema).safeParse(
        versionResult.data ?? [],
      );
      if (!versions.success || versions.data.length > 1) {
        throw responseInvalid();
      }
      const version = versions.data[0];
      if (!version) return null;
      if (version.tenant_id !== input.tenantId) throw responseInvalid();

      const itemResult = await this.client
        .from("douyin_budget_pricing_items")
        .select(PRICING_ITEM_SELECT)
        .eq("pricing_version_id", version.id)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_PRICING_ITEMS + 1);
      assertDatabaseSuccess(itemResult);
      const items = z.array(PricingItemSchema).safeParse(itemResult.data ?? []);
      if (!items.success) throw responseInvalid();
      if (items.data.length > MAX_PRICING_ITEMS) {
        throw Errors.business(
          500,
          "报价项目数量超出上限",
          "DOUYIN_BUDGET_PRICING_ITEM_LIMIT_EXCEEDED",
        );
      }
      validateItemScopeAndOrder(items.data, version.id);
      return { version, items: items.data };
    });
  }

  async countRecentEstimates(input: {
    readonly tenantId: string;
    readonly subjectHash: string;
    readonly requestIpHash: string;
    readonly since: string;
  }): Promise<{ readonly subjectCount: number; readonly ipCount: number }> {
    return execute(async () => {
      const recentCount = (column: "subject_hash" | "request_ip_hash", value: string) =>
        this.client
          .from("douyin_budget_estimates")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", input.tenantId)
          .eq(column, value)
          .gte("created_at", input.since);
      const [subjectResult, ipResult] = await Promise.all([
        recentCount("subject_hash", input.subjectHash),
        recentCount("request_ip_hash", input.requestIpHash),
      ]);
      assertDatabaseSuccess(subjectResult);
      assertDatabaseSuccess(ipResult);
      return {
        subjectCount: parseCount(subjectResult.count),
        ipCount: parseCount(ipResult.count),
      };
    });
  }

  async insertEstimate(
    input: InsertDouyinBudgetEstimateInput,
  ): Promise<DouyinBudgetInsertedEstimate> {
    return execute(async () => {
      const result = await this.client
        .from("douyin_budget_estimates")
        .insert([{
          id: input.id,
          tenant_id: input.tenantId,
          douyin_miniapp_installation_id: input.installationId,
          subject_hash: input.subjectHash,
          request_ip_hash: input.requestIpHash,
          pricing_version_id: input.pricingVersionId,
          estimate_no: input.estimateNo,
          request_payload: input.requestPayload,
          result_payload: input.resultPayload,
          ai_status: "pending",
          expires_at: input.expiresAt,
          created_at: input.createdAt,
        }])
        .select(INSERTED_ESTIMATE_SELECT)
        .single();
      if (result.error) {
        if (isEstimateNumberCollision(result.error)) {
          throw Errors.business(
            409,
            "预算编号冲突",
            "DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT",
          );
        }
        throw repositoryError();
      }
      const parsed = InsertedEstimateSchema.safeParse(result.data);
      if (
        !parsed.success ||
        parsed.data.id !== input.id ||
        parsed.data.estimate_no !== input.estimateNo ||
        parsed.data.tenant_id !== input.tenantId ||
        parsed.data.douyin_miniapp_installation_id !== input.installationId ||
        parsed.data.pricing_version_id !== input.pricingVersionId
      ) {
        throw responseInvalid();
      }
      return parsed.data;
    });
  }
}

function validateItemScopeAndOrder(
  items: readonly DouyinBudgetPricingItemRecord[],
  pricingVersionId: string,
): void {
  let previous: DouyinBudgetPricingItemRecord | undefined;
  for (const item of items) {
    if (item.pricing_version_id !== pricingVersionId) throw responseInvalid();
    if (
      previous &&
      (item.sort_order < previous.sort_order ||
        (item.sort_order === previous.sort_order && item.id <= previous.id))
    ) {
      throw responseInvalid();
    }
    previous = item;
  }
}

function parseCount(value: number | null | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? -1) < 0) {
    throw responseInvalid();
  }
  return value as number;
}

function assertDatabaseSuccess(result: DouyinBudgetDatabaseResult): void {
  if (result.error) throw repositoryError();
}

async function execute<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw repositoryError();
  }
}

function isEstimateNumberCollision(error: unknown): boolean {
  if (!isRecord(error) || error.code !== "23505") return false;
  const marker = [error.message, error.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /douyin_budget_estimates_estimate_no_key|\(estimate_no\)/i.test(marker);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repositoryError() {
  return Errors.business(
    500,
    "预算数据操作失败",
    "DOUYIN_BUDGET_REPOSITORY_ERROR",
  );
}

function responseInvalid() {
  return Errors.business(
    500,
    "预算数据响应无效",
    "DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID",
  );
}

export const douyinBudgetRepository = new DouyinBudgetRepository();
