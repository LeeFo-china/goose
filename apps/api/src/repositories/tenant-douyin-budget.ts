import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const VERSION_FIELDS = [
  "id",
  "tenant_id",
  "version_no",
  "status",
  "effective_from",
  "effective_to",
  "currency",
  "disclaimer",
  "created_by_employee_id",
  "created_at",
  "updated_at",
].join(",");
const ITEM_FIELDS = [
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
  "status",
  "created_at",
  "updated_at",
].join(",");
const ITEMS_PER_VERSION_LIMIT = 100;
const VERSION_IDS_PER_ITEM_BATCH = 10;
const ITEMS_PER_QUERY_LIMIT =
  ITEMS_PER_VERSION_LIMIT * VERSION_IDS_PER_ITEM_BATCH;
const DateTimeSchema = z.iso.datetime({ offset: true });
const RawItemSchema = z.strictObject({
  id: z.uuid(),
  pricing_version_id: z.uuid(),
  category_code: z.string(),
  item_code: z.string(),
  label: z.string(),
  unit: z.string(),
  minimum_amount: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
  maximum_amount: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
  condition_payload: z.record(z.string(), z.unknown()),
  sort_order: z.int(),
  status: z.string(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
const RawVersionSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  version_no: z.int().min(1),
  status: z.enum(["draft", "active", "archived"]),
  effective_from: DateTimeSchema,
  effective_to: DateTimeSchema.nullable(),
  currency: z.literal("CNY"),
  disclaimer: z.string().trim().min(1).max(500),
  created_by_employee_id: z.uuid(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
const RawVersionWithItemsSchema = RawVersionSchema.extend({
  items: z.array(RawItemSchema).max(ITEMS_PER_VERSION_LIMIT),
}).strict();
const CommandErrorSchema = z.strictObject({
  status_code: z.union([z.literal(400), z.literal(404), z.literal(409)]),
  code: z.enum([
    "DOUYIN_BUDGET_PRICING_INVALID",
    "DOUYIN_BUDGET_PRICING_NOT_FOUND",
    "DOUYIN_BUDGET_PRICING_NOT_DRAFT",
    "DOUYIN_BUDGET_PRICING_NOT_ARCHIVABLE",
    "DOUYIN_BUDGET_PRICING_STALE",
    "DOUYIN_BUDGET_PRICING_NOT_EFFECTIVE",
    "DOUYIN_BUDGET_PRICING_BASE_COVERAGE_INVALID",
  ]),
  message: z.string().trim().min(1).max(500),
});
const CommandEnvelopeSchema = z.union([
  z.strictObject({ data: RawVersionWithItemsSchema }),
  z.strictObject({ error: CommandErrorSchema }),
]);

export type TenantDouyinBudgetRawItem = z.infer<typeof RawItemSchema>;
export type TenantDouyinBudgetRawVersion = z.infer<typeof RawVersionSchema>;
export type TenantDouyinBudgetRawVersionWithItems = z.infer<
  typeof RawVersionWithItemsSchema
>;
export type TenantDouyinBudgetCommandResult =
  | { readonly ok: true; readonly data: TenantDouyinBudgetRawVersionWithItems }
  | { readonly ok: false; readonly error: z.infer<typeof CommandErrorSchema> };

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};
export interface TenantDouyinBudgetQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): TenantDouyinBudgetQuery;
  eq(...args: unknown[]): TenantDouyinBudgetQuery;
  in(...args: unknown[]): TenantDouyinBudgetQuery;
  order(...args: unknown[]): TenantDouyinBudgetQuery;
  range(...args: unknown[]): TenantDouyinBudgetQuery;
  limit(...args: unknown[]): TenantDouyinBudgetQuery;
  maybeSingle(): Promise<DatabaseResult>;
}
type PricingCommandName =
  | "create_douyin_budget_pricing_draft"
  | "replace_douyin_budget_pricing_items"
  | "activate_douyin_budget_pricing_version"
  | "archive_douyin_budget_pricing_version";
export interface TenantDouyinBudgetDatabaseClient {
  from(table: string): TenantDouyinBudgetQuery;
  rpc(
    functionName: PricingCommandName,
    args: Readonly<Record<string, Json | undefined>>,
  ): Promise<DatabaseResult>;
}

export class TenantDouyinBudgetRepository {
  constructor(private readonly configuredClient?: TenantDouyinBudgetDatabaseClient) {}

  private get client(): TenantDouyinBudgetDatabaseClient {
    return this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as
      TenantDouyinBudgetDatabaseClient;
  }

  async listVersions(input: {
    tenantId: string;
    page: number;
    pageSize: number;
  }): Promise<{
    activeVersion: TenantDouyinBudgetRawVersionWithItems | null;
    rows: TenantDouyinBudgetRawVersionWithItems[];
    total: number;
  }> {
    const from = (input.page - 1) * input.pageSize;
    const activeOperation = executeDatabase(
      () => this.client.from("douyin_budget_pricing_versions")
        .select(VERSION_FIELDS)
        .eq("tenant_id", input.tenantId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      "查询当前生效抖音预算报价失败",
    );
    const pageOperation = executeDatabase(
      () => this.client.from("douyin_budget_pricing_versions")
        .select(VERSION_FIELDS, { count: "exact" })
        .eq("tenant_id", input.tenantId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + input.pageSize - 1),
      "查询抖音预算报价版本失败",
    );
    const [activeResult, versionResult] = await Promise.all([
      activeOperation,
      pageOperation,
    ]);
    assertDatabaseSuccess(activeResult, "查询当前生效抖音预算报价失败");
    assertDatabaseSuccess(versionResult, "查询抖音预算报价版本失败");
    if (!Number.isInteger(versionResult.count) || versionResult.count! < 0) {
      throw Errors.dbError("查询抖音预算报价版本总数失败");
    }
    const versions = parseData(
      z.array(RawVersionSchema),
      versionResult.data ?? [],
      "解析抖音预算报价版本失败",
    );
    const activeVersion = activeResult.data === null
      ? null
      : parseData(
        RawVersionSchema,
        activeResult.data,
        "解析当前生效抖音预算报价失败",
      );
    if (versions.length === 0 && !activeVersion) {
      return { activeVersion: null, rows: [], total: versionResult.count! };
    }

    const versionIds = [...new Set([
      ...(activeVersion ? [activeVersion.id] : []),
      ...versions.map((version) => version.id),
    ])];
    const itemResults = await Promise.all(
      chunkValues(versionIds, VERSION_IDS_PER_ITEM_BATCH).map((ids) =>
        executeDatabase(
          () => this.client.from("douyin_budget_pricing_items")
            .select(ITEM_FIELDS)
            .in("pricing_version_id", ids)
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true })
            .limit(ITEMS_PER_QUERY_LIMIT),
          "查询抖音预算报价项目失败",
        )
      ),
    );
    for (const result of itemResults) {
      assertDatabaseSuccess(result, "查询抖音预算报价项目失败");
    }
    const items = parseData(
      z.array(RawItemSchema),
      itemResults.flatMap((result) => result.data ?? []),
      "解析抖音预算报价项目失败",
    );
    const itemsByVersion = new Map<string, TenantDouyinBudgetRawItem[]>();
    for (const item of items) {
      const bucket = itemsByVersion.get(item.pricing_version_id) ?? [];
      if (bucket.length >= ITEMS_PER_VERSION_LIMIT) {
        throw Errors.dbError("抖音预算报价项目数量超限");
      }
      bucket.push(item);
      itemsByVersion.set(item.pricing_version_id, bucket);
    }
    return {
      activeVersion: activeVersion
        ? hydrateVersion(activeVersion, itemsByVersion)
        : null,
      rows: versions.map((version) => hydrateVersion(version, itemsByVersion)),
      total: versionResult.count!,
    };
  }

  createDraft(input: {
    tenantId: string;
    employeeId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    disclaimer: string;
  }) {
    return this.runCommand("create_douyin_budget_pricing_draft", {
      p_tenant_id: input.tenantId,
      p_created_by_employee_id: input.employeeId,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
      p_disclaimer: input.disclaimer,
    });
  }

  replaceItems(input: {
    tenantId: string;
    versionId: string;
    expectedUpdatedAt: string;
    items: readonly Record<string, Json>[];
  }) {
    return this.runCommand("replace_douyin_budget_pricing_items", {
      p_tenant_id: input.tenantId,
      p_pricing_version_id: input.versionId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_items: [...input.items],
    });
  }

  activate(input: { tenantId: string; versionId: string; expectedUpdatedAt: string }) {
    return this.runOptimisticCommand(
      "activate_douyin_budget_pricing_version",
      input,
    );
  }

  archive(input: { tenantId: string; versionId: string; expectedUpdatedAt: string }) {
    return this.runOptimisticCommand(
      "archive_douyin_budget_pricing_version",
      input,
    );
  }

  private runOptimisticCommand(
    name: Exclude<PricingCommandName, "create_douyin_budget_pricing_draft" |
      "replace_douyin_budget_pricing_items">,
    input: { tenantId: string; versionId: string; expectedUpdatedAt: string },
  ) {
    return this.runCommand(name, {
      p_tenant_id: input.tenantId,
      p_pricing_version_id: input.versionId,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
  }

  private async runCommand(
    name: PricingCommandName,
    args: Readonly<Record<string, Json | undefined>>,
  ): Promise<TenantDouyinBudgetCommandResult> {
    const result = await executeDatabase(
      () => this.client.rpc(name, args),
      "执行抖音预算报价命令失败",
    );
    assertDatabaseSuccess(result, "执行抖音预算报价命令失败");
    const envelope = parseData(
      CommandEnvelopeSchema,
      result.data,
      "解析抖音预算报价命令结果失败",
    );
    return "data" in envelope
      ? { ok: true, data: envelope.data }
      : { ok: false, error: envelope.error };
  }
}

function hydrateVersion(
  version: TenantDouyinBudgetRawVersion,
  itemsByVersion: ReadonlyMap<string, TenantDouyinBudgetRawItem[]>,
): TenantDouyinBudgetRawVersionWithItems {
  return { ...version, items: itemsByVersion.get(version.id) ?? [] };
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function assertDatabaseSuccess(result: DatabaseResult, message: string): void {
  if (result.error) throw Errors.dbError(message);
}

function parseData<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.dbError(message);
  return parsed.data;
}

async function executeDatabase<T>(
  operation: () => T | PromiseLike<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError(message);
  }
}

export const tenantDouyinBudgetRepository = new TenantDouyinBudgetRepository();
