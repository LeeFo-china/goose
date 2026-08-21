import {
  DOUYIN_DECORATION_SCOPE_VALUES,
  DOUYIN_DECORATION_TIER_VALUES,
  DOUYIN_PROPERTY_CONDITION_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  tenantDouyinBudgetRepository,
  type TenantDouyinBudgetCommandResult,
  type TenantDouyinBudgetRawItem,
  type TenantDouyinBudgetRawVersionWithItems,
} from "@/repositories/tenant-douyin-budget";
import {
  TenantDouyinBudgetCreateDraftSchema,
  TenantDouyinBudgetListQuerySchema,
  TenantDouyinBudgetOptimisticActionSchema,
  TenantDouyinBudgetPricingItemSchema,
  TenantDouyinBudgetReplaceItemsSchema,
  TenantDouyinBudgetVersionParamsSchema,
  type TenantDouyinBudgetCreateDraft,
  type TenantDouyinBudgetListQuery,
  type TenantDouyinBudgetOptimisticAction,
  type TenantDouyinBudgetPricingItem,
  type TenantDouyinBudgetReplaceItems,
} from "@/schema/tenant-douyin-budget";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import type { Json } from "@/types/database";

const MANAGE_PERMISSION = "douyin_miniapp.manage";
const CoefficientSchema = z.int().min(1).max(100_000);
const BaseConditionSchema = z.strictObject({
  role: z.literal("base"),
  property_conditions: z.tuple([z.enum(DOUYIN_PROPERTY_CONDITION_VALUES)]),
  decoration_tiers: z.tuple([z.enum(DOUYIN_DECORATION_TIER_VALUES)]),
  decoration_scopes: z.tuple([
    z.literal("whole_house"),
    z.literal("partial"),
  ]),
  property_condition_coefficient_bps: CoefficientSchema,
  decoration_scope_coefficient_bps: z.strictObject({
    whole_house: CoefficientSchema,
    partial: CoefficientSchema,
  }),
});
const OptionConditionSchema = z.strictObject({
  role: z.literal("option"),
  property_conditions: canonicalArray(DOUYIN_PROPERTY_CONDITION_VALUES)
    .optional(),
  decoration_tiers: canonicalArray(DOUYIN_DECORATION_TIER_VALUES).optional(),
  decoration_scopes: canonicalArray(DOUYIN_DECORATION_SCOPE_VALUES).optional(),
});

type RepositoryPort = {
  listVersions(input: {
    tenantId: string;
    page: number;
    pageSize: number;
  }): Promise<{
    activeVersion: TenantDouyinBudgetRawVersionWithItems | null;
    rows: TenantDouyinBudgetRawVersionWithItems[];
    total: number;
  }>;
  createDraft(input: {
    tenantId: string;
    employeeId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    disclaimer: string;
  }): Promise<TenantDouyinBudgetCommandResult>;
  replaceItems(input: {
    tenantId: string;
    versionId: string;
    expectedUpdatedAt: string;
    items: readonly Record<string, Json>[];
  }): Promise<TenantDouyinBudgetCommandResult>;
  activate(input: OptimisticCommandInput): Promise<TenantDouyinBudgetCommandResult>;
  archive(input: OptimisticCommandInput): Promise<TenantDouyinBudgetCommandResult>;
};
type AccessPolicyPort = {
  assertTenantContext(authContext: AuthContext): string;
  assertPermission(authContext: AuthContext, permission: string): unknown;
};
type OptimisticCommandInput = {
  tenantId: string;
  versionId: string;
  expectedUpdatedAt: string;
};

export class TenantDouyinBudgetService {
  constructor(private readonly dependencies: {
    readonly repository: RepositoryPort;
    readonly accessPolicy: AccessPolicyPort;
  }) {}

  async list(authContext: AuthContext, input: TenantDouyinBudgetListQuery) {
    const tenantId = this.requireTenant(authContext);
    const query = parseRequest(TenantDouyinBudgetListQuerySchema, input);
    const result = await this.dependencies.repository.listVersions({
      tenantId,
      ...query,
    });
    if (!Number.isInteger(result.total) || result.total < 0) {
      throwInvalidResponse();
    }
    const activeVersion = result.activeVersion
      ? this.toScopedVersion(result.activeVersion, tenantId)
      : null;
    if (activeVersion && activeVersion.status !== "active") {
      throwInvalidResponse();
    }
    return {
      active_version: activeVersion,
      list: result.rows.map((version) =>
        this.toScopedVersion(version, tenantId)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total === 0
          ? 0
          : Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async createDraft(
    authContext: AuthContext,
    input: TenantDouyinBudgetCreateDraft,
  ) {
    const tenantId = this.requireTenant(authContext);
    const employeeId = requireEmployee(authContext);
    const body = parseRequest(TenantDouyinBudgetCreateDraftSchema, input);
    const result = await this.dependencies.repository.createDraft({
      tenantId,
      employeeId,
      effectiveFrom: body.effective_from,
      effectiveTo: body.effective_to,
      disclaimer: body.disclaimer,
    });
    return this.unwrapCommand(result, tenantId);
  }

  async replaceItems(
    authContext: AuthContext,
    versionId: string,
    input: TenantDouyinBudgetReplaceItems,
  ) {
    const tenantId = this.requireTenant(authContext);
    const id = parseVersionId(versionId);
    const body = parseRequest(TenantDouyinBudgetReplaceItemsSchema, input);
    const result = await this.dependencies.repository.replaceItems({
      tenantId,
      versionId: id,
      expectedUpdatedAt: body.expected_updated_at,
      items: body.items.map(toPersistenceItem),
    });
    return this.unwrapCommand(result, tenantId, id);
  }

  activate(
    authContext: AuthContext,
    versionId: string,
    input: TenantDouyinBudgetOptimisticAction,
  ) {
    return this.runOptimisticCommand("activate", authContext, versionId, input);
  }

  archive(
    authContext: AuthContext,
    versionId: string,
    input: TenantDouyinBudgetOptimisticAction,
  ) {
    return this.runOptimisticCommand("archive", authContext, versionId, input);
  }

  private async runOptimisticCommand(
    action: "activate" | "archive",
    authContext: AuthContext,
    versionId: string,
    input: TenantDouyinBudgetOptimisticAction,
  ) {
    const tenantId = this.requireTenant(authContext);
    const id = parseVersionId(versionId);
    const body = parseRequest(TenantDouyinBudgetOptimisticActionSchema, input);
    const result = await this.dependencies.repository[action]({
      tenantId,
      versionId: id,
      expectedUpdatedAt: body.expected_updated_at,
    });
    return this.unwrapCommand(result, tenantId, id);
  }

  private requireTenant(authContext: AuthContext): string {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(authContext);
    this.dependencies.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return tenantId;
  }

  private unwrapCommand(
    result: TenantDouyinBudgetCommandResult,
    tenantId: string,
    expectedVersionId?: string,
  ) {
    if (!result.ok) throwCommandError(result.error);
    return this.toScopedVersion(result.data, tenantId, expectedVersionId);
  }

  private toScopedVersion(
    version: TenantDouyinBudgetRawVersionWithItems,
    tenantId: string,
    expectedVersionId?: string,
  ) {
    if (
      version.tenant_id !== tenantId ||
      (expectedVersionId !== undefined && version.id !== expectedVersionId) ||
      version.items.some((item) => item.pricing_version_id !== version.id)
    ) {
      throwInvalidResponse();
    }
    return {
      id: version.id,
      tenant_id: version.tenant_id,
      version_no: version.version_no,
      status: version.status,
      effective_from: version.effective_from,
      effective_to: version.effective_to,
      currency: version.currency,
      disclaimer: version.disclaimer,
      created_by_employee_id: version.created_by_employee_id,
      created_at: version.created_at,
      updated_at: version.updated_at,
      items: version.items.map(toWireItem),
    };
  }
}

function toWireItem(raw: TenantDouyinBudgetRawItem): TenantDouyinBudgetPricingItem {
  const base = BaseConditionSchema.safeParse(raw.condition_payload);
  const candidate = base.success
    ? {
      role: "base" as const,
      category_code: raw.category_code,
      item_code: raw.item_code,
      label: raw.label,
      unit: raw.unit,
      minimum_amount_fen: raw.minimum_amount,
      maximum_amount_fen: raw.maximum_amount,
      property_condition: base.data.property_conditions[0],
      decoration_tier: base.data.decoration_tiers[0],
      property_condition_coefficient_bps:
        base.data.property_condition_coefficient_bps,
      whole_house_coefficient_bps:
        base.data.decoration_scope_coefficient_bps.whole_house,
      partial_coefficient_bps:
        base.data.decoration_scope_coefficient_bps.partial,
      sort_order: raw.sort_order,
      status: raw.status,
    }
    : toWireOption(raw);
  const parsed = TenantDouyinBudgetPricingItemSchema.safeParse(candidate);
  if (!parsed.success) throwInvalidResponse();
  return parsed.data;
}

function toWireOption(raw: TenantDouyinBudgetRawItem) {
  const condition = OptionConditionSchema.safeParse(raw.condition_payload);
  if (!condition.success) throwInvalidResponse();
  return {
    role: "option" as const,
    category_code: raw.category_code,
    item_code: raw.item_code,
    label: raw.label,
    unit: raw.unit,
    minimum_amount_fen: raw.minimum_amount,
    maximum_amount_fen: raw.maximum_amount,
    property_conditions: condition.data.property_conditions ?? [],
    decoration_tiers: condition.data.decoration_tiers ?? [],
    decoration_scopes: condition.data.decoration_scopes ?? [],
    sort_order: raw.sort_order,
    status: raw.status,
  };
}

function toPersistenceItem(item: TenantDouyinBudgetPricingItem): Record<string, Json> {
  const common = {
    category_code: item.category_code,
    item_code: item.item_code,
    label: item.label,
    unit: item.unit,
    minimum_amount: item.minimum_amount_fen,
    maximum_amount: item.maximum_amount_fen,
    sort_order: item.sort_order,
    status: item.status,
  };
  if (item.role === "base") {
    return {
      ...common,
      condition_payload: {
        role: "base",
        property_conditions: [item.property_condition],
        decoration_tiers: [item.decoration_tier],
        decoration_scopes: [...DOUYIN_DECORATION_SCOPE_VALUES],
        property_condition_coefficient_bps:
          item.property_condition_coefficient_bps,
        decoration_scope_coefficient_bps: {
          whole_house: item.whole_house_coefficient_bps,
          partial: item.partial_coefficient_bps,
        },
      },
    };
  }
  return {
    ...common,
    condition_payload: {
      role: "option",
      ...(item.property_conditions.length > 0
        ? { property_conditions: item.property_conditions }
        : {}),
      ...(item.decoration_tiers.length > 0
        ? { decoration_tiers: item.decoration_tiers }
        : {}),
      ...(item.decoration_scopes.length > 0
        ? { decoration_scopes: item.decoration_scopes }
        : {}),
    },
  };
}

const COMMAND_ERROR_STATUS: Readonly<Record<string, number>> = {
  DOUYIN_BUDGET_PRICING_INVALID: 400,
  DOUYIN_BUDGET_PRICING_BASE_COVERAGE_INVALID: 400,
  DOUYIN_BUDGET_PRICING_NOT_FOUND: 404,
  DOUYIN_BUDGET_PRICING_NOT_DRAFT: 409,
  DOUYIN_BUDGET_PRICING_NOT_ARCHIVABLE: 409,
  DOUYIN_BUDGET_PRICING_STALE: 409,
  DOUYIN_BUDGET_PRICING_NOT_EFFECTIVE: 409,
};

function throwCommandError(error: {
  readonly status_code: number;
  readonly code: string;
  readonly message: string;
}): never {
  if (COMMAND_ERROR_STATUS[error.code] !== error.status_code) {
    throwInvalidResponse();
  }
  throw Errors.business(error.status_code, error.message, error.code);
}

function requireEmployee(authContext: AuthContext): string {
  if (!authContext.employeeId) {
    throw Errors.business(
      403,
      "当前操作需要有效员工身份",
      "DOUYIN_BUDGET_PRICING_EMPLOYEE_REQUIRED",
    );
  }
  return authContext.employeeId;
}

function parseVersionId(value: string): string {
  return parseRequest(TenantDouyinBudgetVersionParamsSchema, { id: value }).id;
}

function throwInvalidResponse(): never {
  throw Errors.business(
    500,
    "租户抖音预算报价数据无效",
    "DOUYIN_BUDGET_PRICING_RESPONSE_INVALID",
  );
}

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function canonicalArray<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z.array(z.enum(values)).min(1).max(values.length).refine(
    (items) => items.every((item, index) =>
      index === 0 || values.indexOf(item) >
        values.indexOf(items[index - 1] ?? item)),
    "报价条件顺序无效",
  );
}

export const tenantDouyinBudgetService = new TenantDouyinBudgetService({
  repository: tenantDouyinBudgetRepository,
  accessPolicy: accessPolicyService,
});
