import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { Database, Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const ACTIVE_VERSION_SELECT = [
  "id",
  "tenant_id",
  "version_no",
  "effective_from",
  "effective_to",
  "currency",
  "disclaimer",
  "factor_payload",
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
  factor_payload: z.record(z.string(), z.unknown()),
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
const CommandErrorSchema = z.discriminatedUnion("code", [
  z.strictObject({
    status_code: z.literal(400),
    code: z.literal("DOUYIN_BUDGET_COMMAND_INVALID"),
  }),
  z.strictObject({
    status_code: z.literal(404),
    code: z.literal("DOUYIN_BUDGET_NOT_CONFIGURED"),
  }),
  z.strictObject({
    status_code: z.literal(409),
    code: z.literal("DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED"),
  }),
  z.strictObject({
    status_code: z.literal(409),
    code: z.literal("DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT"),
  }),
  z.strictObject({
    status_code: z.literal(429),
    code: z.literal("DOUYIN_BUDGET_RATE_LIMITED"),
  }),
]);
const CommandEnvelopeSchema = z.union([
  z.strictObject({ data: InsertedEstimateSchema }),
  z.strictObject({ error: CommandErrorSchema }),
]);

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
type CreateEstimateRpcArgs = Database["public"]["Functions"][
  "create_douyin_budget_estimate"
]["Args"];

export interface DouyinBudgetQuery
  extends PromiseLike<DouyinBudgetDatabaseResult> {
  select(columns: string, options?: Record<string, unknown>): DouyinBudgetQuery;
  eq(column: string, value: unknown): DouyinBudgetQuery;
  lte(column: string, value: unknown): DouyinBudgetQuery;
  or(filters: string): DouyinBudgetQuery;
  order(column: string, options: Record<string, unknown>): DouyinBudgetQuery;
  limit(count: number): DouyinBudgetQuery;
}

export interface DouyinBudgetDatabaseClient {
  from(table: string): DouyinBudgetQuery;
  rpc(
    name: "create_douyin_budget_estimate",
    args: CreateEstimateRpcArgs,
  ): PromiseLike<DouyinBudgetDatabaseResult>;
}

export interface CreateDouyinBudgetEstimateAtomicInput {
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
  readonly requestIpHash: string;
  readonly pricingVersionId: string;
  readonly estimateNo: string;
  readonly requestPayload: Json;
  readonly resultPayload: Json;
  readonly expiresAt: string;
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

  async createEstimateAtomic(
    input: CreateDouyinBudgetEstimateAtomicInput,
  ): Promise<DouyinBudgetInsertedEstimate> {
    return execute(async () => {
      const result = await this.client.rpc("create_douyin_budget_estimate", {
        p_tenant_id: input.tenantId,
        p_douyin_miniapp_installation_id: input.installationId,
        p_subject_hash: input.subjectHash,
        p_request_ip_hash: input.requestIpHash,
        p_pricing_version_id: input.pricingVersionId,
        p_estimate_no: input.estimateNo,
        p_request_payload: input.requestPayload,
        p_result_payload: input.resultPayload,
        p_expires_at: input.expiresAt,
      });
      assertDatabaseSuccess(result);
      const parsed = CommandEnvelopeSchema.safeParse(result.data);
      if (!parsed.success) throw responseInvalid();
      if ("error" in parsed.data) throw commandError(parsed.data.error);
      const inserted = parsed.data.data;
      if (
        inserted.estimate_no !== input.estimateNo ||
        inserted.tenant_id !== input.tenantId ||
        inserted.douyin_miniapp_installation_id !== input.installationId ||
        inserted.pricing_version_id !== input.pricingVersionId
      ) {
        throw responseInvalid();
      }
      return inserted;
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

function commandError(error: z.infer<typeof CommandErrorSchema>) {
  const messages = {
    DOUYIN_BUDGET_COMMAND_INVALID: "预算创建请求无效",
    DOUYIN_BUDGET_NOT_CONFIGURED: "预算报价暂未配置",
    DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED: "当前小程序不支持预算试算",
    DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT: "预算编号冲突",
    DOUYIN_BUDGET_RATE_LIMITED: "预算试算过于频繁，请稍后再试",
  } as const;
  return Errors.business(error.status_code, messages[error.code], error.code);
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
