import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  brandingRepository,
  type BrandingTenantRecord,
} from "@/repositories/branding";
import {
  tenantEntitlementsRepository,
  type ApplyTenantEntitlementActionInput,
  type TenantEntitlementRecord,
} from "@/repositories/tenant-entitlements";
import type {
  BrandingEntitlementListQueryInput,
  EntitlementGrantInput,
  EntitlementResumeInput,
  EntitlementRevokeInput,
  EntitlementSuspendInput,
} from "@/schema/branding";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  CUSTOM_SUPPORT_BRANDING,
  isEntitlementActive,
  serializeEntitlement,
} from "@/services/branding-contracts";

type EntitlementRepositoryPort = Pick<
  typeof tenantEntitlementsRepository,
  "listByTenant" | "findByCode" | "applyAction" | "expireIfDue"
>;

type BrandingRepositoryPort = {
  findTenant(tenantId: string): Promise<BrandingTenantRecord | null>;
};

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;

export type TenantEntitlementsServiceDependencies = {
  entitlementRepository?: EntitlementRepositoryPort;
  brandingRepository?: BrandingRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
};

type GrantInput = Omit<EntitlementGrantInput, "term_years"> & {
  term_years?: number;
};

type EntitlementSummary = {
  entitlement: ReturnType<typeof serializeEntitlement>;
  isActive: boolean;
};

const PLATFORM_MANAGE_PERMISSION = "platform.tenant_entitlement.manage";
const TENANT_UPDATE_PERMISSION = "brand.settings.update";
const ERROR_SEARCH_MAX_DEPTH = 8;
const ERROR_SEARCH_MAX_NODES = 64;
const ERROR_SEARCH_FIELDS = ["code", "message", "details", "hint"] as const;

export class TenantEntitlementsService {
  private readonly entitlementRepository: EntitlementRepositoryPort;
  private readonly brandingRepository: BrandingRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;

  constructor(dependencies: TenantEntitlementsServiceDependencies = {}) {
    this.entitlementRepository = dependencies.entitlementRepository ??
      tenantEntitlementsRepository;
    this.brandingRepository = dependencies.brandingRepository ??
      brandingRepository;
    this.accessPolicyService = dependencies.accessPolicyService ??
      accessPolicyService;
  }

  async listPlatform(
    authContext: AuthContext,
    tenantId: string,
    query: BrandingEntitlementListQueryInput,
  ) {
    this.assertPlatformManage(authContext);
    await this.assertTenantExists(tenantId);
    const result = await this.entitlementRepository.listByTenant(
      tenantId,
      query,
    );

    return {
      list: result.rows.map(serializeEntitlement),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total
          ? Math.ceil(result.total / query.pageSize)
          : 0,
      },
    };
  }

  async grant(
    authContext: AuthContext,
    tenantId: string,
    input: GrantInput,
    now = new Date(),
  ) {
    const actor = this.requirePlatformActor(authContext);
    await this.assertTenantExists(tenantId);
    await this.expireEntitlementIfDue(
      tenantId,
      now,
    );
    const current = await this.findEntitlement(tenantId);

    return this.applyAction({
      tenantId,
      entitlementCode: CUSTOM_SUPPORT_BRANDING,
      action: "grant",
      termYears: input.term_years ?? 1,
      reason: input.reason,
      expectedVersion: current?.version ?? 0,
      ...actor,
    });
  }

  async suspend(
    authContext: AuthContext,
    tenantId: string,
    input: EntitlementSuspendInput,
  ) {
    return this.applyPlatformAction(authContext, tenantId, {
      action: "suspend",
      reason: input.reason,
      expectedVersion: input.version,
    });
  }

  async resume(
    authContext: AuthContext,
    tenantId: string,
    input: EntitlementResumeInput,
    now = new Date(),
  ) {
    const actor = this.requirePlatformActor(authContext);
    await this.assertTenantExists(tenantId);
    await this.expireEntitlementIfDue(tenantId, now);
    const previous = await this.findEntitlement(tenantId);
    if (!previous) {
      throw Errors.business(
        404,
        "租户品牌权益不存在",
        ErrorCodes.TENANT_ENTITLEMENT_NOT_FOUND,
      );
    }
    const previousExpiry = finiteTimestamp(previous.expires_at);
    if (previousExpiry === null) {
      throw Errors.dbError("租户品牌权益到期时间无效");
    }
    if (
      previous.status === "expired" ||
      (
        (previous.status === "active" || previous.status === "suspended") &&
        previousExpiry <= now.getTime()
      )
    ) {
      throw brandingEntitlementExpired(409);
    }

    const result = await this.applyActionRecord({
      tenantId,
      entitlementCode: CUSTOM_SUPPORT_BRANDING,
      action: "resume",
      termYears: null,
      reason: input.reason,
      expectedVersion: input.version,
      ...actor,
    });
    const resultExpiry = finiteTimestamp(result.expires_at);
    if (resultExpiry === null || resultExpiry !== previousExpiry) {
      throw Errors.dbError("恢复租户品牌权益结果到期时间异常");
    }

    return { entitlement: serializeEntitlement(result) };
  }

  async revoke(
    authContext: AuthContext,
    tenantId: string,
    input: EntitlementRevokeInput,
  ) {
    return this.applyPlatformAction(authContext, tenantId, {
      action: "revoke",
      reason: input.reason,
      expectedVersion: input.version,
    });
  }

  async getTenantSummary(
    tenantId: string,
    now = new Date(),
  ): Promise<EntitlementSummary | null> {
    const tenant = await this.brandingRepository.findTenant(tenantId);
    if (!tenant) return null;

    let entitlement = await this.findEntitlement(tenantId);
    if (!entitlement) return null;
    if (isDueForReconciliation(entitlement, now)) {
      const reconciled = await this.expireEntitlementIfDue(tenantId, now);
      if (!reconciled) throw entitlementQueryError();
      entitlement = reconciled;
    }

    return {
      entitlement: serializeEntitlement(entitlement),
      isActive: isEntitlementActive(entitlement, tenant.status, now),
    };
  }

  async assertCanCustomize(authContext: AuthContext, now = new Date()) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(
      authContext,
      TENANT_UPDATE_PERMISSION,
    )) {
      throw Errors.forbidden();
    }

    const summary = await this.getTenantSummary(tenantId, now);
    if (!summary) {
      throw Errors.business(
        403,
        "当前租户尚未开通自定义品牌权益",
        ErrorCodes.BRANDING_ENTITLEMENT_REQUIRED,
      );
    }

    this.assertCustomizableSummary(summary, now);
    return { tenantId, entitlement: summary.entitlement };
  }

  private async applyPlatformAction(
    authContext: AuthContext,
    tenantId: string,
    action: {
      action: "suspend" | "revoke";
      reason: string;
      expectedVersion: number;
    },
  ) {
    const actor = this.requirePlatformActor(authContext);
    await this.assertTenantExists(tenantId);
    return this.applyAction({
      tenantId,
      entitlementCode: CUSTOM_SUPPORT_BRANDING,
      termYears: null,
      ...action,
      ...actor,
    });
  }

  private async applyAction(input: ApplyTenantEntitlementActionInput) {
    const entitlement = await this.applyActionRecord(input);
    return { entitlement: serializeEntitlement(entitlement) };
  }

  private async applyActionRecord(input: ApplyTenantEntitlementActionInput) {
    try {
      return await this.entitlementRepository.applyAction(input);
    } catch (error) {
      throw mapEntitlementActionError(error);
    }
  }

  private async findEntitlement(tenantId: string) {
    try {
      return await this.entitlementRepository.findByCode(
        tenantId,
        CUSTOM_SUPPORT_BRANDING,
      );
    } catch {
      throw entitlementQueryError();
    }
  }

  private async expireEntitlementIfDue(tenantId: string, now: Date) {
    try {
      return await this.entitlementRepository.expireIfDue(
        tenantId,
        CUSTOM_SUPPORT_BRANDING,
        now,
      );
    } catch {
      throw entitlementQueryError();
    }
  }

  private requirePlatformActor(authContext: AuthContext) {
    this.assertPlatformManage(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    return {
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
    };
  }

  private assertPlatformManage(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      !this.accessPolicyService.hasPermission(
        authContext,
        PLATFORM_MANAGE_PERMISSION,
      )
    ) {
      throw Errors.forbidden();
    }
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.brandingRepository.findTenant(tenantId);
    if (!tenant) throw Errors.notFound("租户不存在");
  }

  private assertCustomizableSummary(
    summary: EntitlementSummary,
    now: Date,
  ) {
    const { entitlement } = summary;
    if (entitlement.status === "suspended") {
      if (new Date(entitlement.expires_at).getTime() <= now.getTime()) {
        throw brandingEntitlementExpired(403);
      }
      throw Errors.business(
        403,
        "自定义品牌权益已暂停",
        ErrorCodes.BRANDING_ENTITLEMENT_SUSPENDED,
      );
    }
    if (entitlement.status === "expired") {
      throw brandingEntitlementExpired(403);
    }
    if (entitlement.status === "revoked") {
      throw Errors.business(
        403,
        "自定义品牌权益已撤销",
        ErrorCodes.BRANDING_ENTITLEMENT_REVOKED,
      );
    }
    if (!summary.isActive) {
      if (new Date(entitlement.expires_at).getTime() <= now.getTime()) {
        throw brandingEntitlementExpired(403);
      }
      throw Errors.business(
        403,
        "当前租户尚无有效自定义品牌权益",
        ErrorCodes.BRANDING_ENTITLEMENT_REQUIRED,
      );
    }
  }
}

function mapEntitlementActionError(error: unknown): unknown {
  if (containsErrorCode(error, ErrorCodes.TENANT_ENTITLEMENT_NOT_FOUND)) {
    return Errors.business(
      404,
      "租户品牌权益不存在",
      ErrorCodes.TENANT_ENTITLEMENT_NOT_FOUND,
    );
  }
  if (containsErrorCode(
    error,
    ErrorCodes.TENANT_ENTITLEMENT_VERSION_CONFLICT,
  )) {
    return Errors.business(
      409,
      "租户品牌权益版本已变化，请刷新后重试",
      ErrorCodes.TENANT_ENTITLEMENT_VERSION_CONFLICT,
    );
  }
  if (containsErrorCode(
    error,
    ErrorCodes.TENANT_ENTITLEMENT_STATE_CONFLICT,
  )) {
    return Errors.business(
      409,
      "当前租户品牌权益状态不允许该操作",
      ErrorCodes.TENANT_ENTITLEMENT_STATE_CONFLICT,
    );
  }
  if (containsErrorCode(error, ErrorCodes.BRANDING_ENTITLEMENT_EXPIRED)) {
    return brandingEntitlementExpired(409);
  }
  return Errors.dbError("租户权益操作失败");
}

function containsErrorCode(value: unknown, expected: string): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{
    value,
    depth: 0,
  }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (pending.length > 0 && visitedNodes < ERROR_SEARCH_MAX_NODES) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === "string") {
      if (current.value.includes(expected)) return true;
      continue;
    }
    if (typeof current.value !== "object" || current.value === null) continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    visitedNodes += 1;
    if (current.depth >= ERROR_SEARCH_MAX_DEPTH) continue;

    const values = Array.isArray(current.value)
      ? current.value.slice(0, ERROR_SEARCH_MAX_NODES - visitedNodes)
      : ERROR_SEARCH_FIELDS.map((field) =>
        (current.value as Record<string, unknown>)[field]
      );
    for (const nestedValue of values) {
      pending.push({ value: nestedValue, depth: current.depth + 1 });
    }
  }

  return false;
}

function isDueForReconciliation(
  entitlement: TenantEntitlementRecord,
  now: Date,
) {
  if (
    entitlement.status !== "active" &&
    entitlement.status !== "suspended"
  ) return false;
  const expiry = finiteTimestamp(entitlement.expires_at);
  return expiry !== null && expiry <= now.getTime();
}

function finiteTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function entitlementQueryError() {
  return Errors.dbError("租户权益查询失败");
}

function brandingEntitlementExpired(statusCode: 403 | 409) {
  return Errors.business(
    statusCode,
    "自定义品牌权益已过期",
    ErrorCodes.BRANDING_ENTITLEMENT_EXPIRED,
  );
}

export const tenantEntitlementsService = new TenantEntitlementsService();
