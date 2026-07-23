import type { OcrTenantPolicyDocumentType } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import {
  ocrTenantPolicyRepository,
  type OcrTenantPolicyPlatformListInput,
} from "@/repositories/ocr-tenant-policies";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

type UpdatePlatformOcrTenantPolicyInput = {
  enabled: boolean;
  allowed_document_types: OcrTenantPolicyDocumentType[];
  daily_limit: number | null;
  remark: string | null;
};

export type OcrTenantPolicyServiceDependencies = {
  repository?: Pick<
    typeof ocrTenantPolicyRepository,
    "findByTenantId" | "findTenantById" | "listPlatform" | "upsert"
  >;
  accessPolicy?: Pick<typeof accessPolicyService, "hasPermission">;
  audit?: Pick<typeof platformAuditLogService, "recordBestEffort">;
  nowFactory?: () => Date;
};

export class OcrTenantPolicyService {
  private readonly repository: NonNullable<
    OcrTenantPolicyServiceDependencies["repository"]
  >;
  private readonly accessPolicy: NonNullable<
    OcrTenantPolicyServiceDependencies["accessPolicy"]
  >;
  private readonly audit: NonNullable<OcrTenantPolicyServiceDependencies["audit"]>;
  private readonly nowFactory: () => Date;

  constructor(dependencies: OcrTenantPolicyServiceDependencies = {}) {
    this.repository = dependencies.repository ?? ocrTenantPolicyRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async getRuntimePolicy(tenantId: string, platformDefaultDailyLimit: number) {
    const policy = await this.repository.findByTenantId(tenantId);
    return {
      enabled: policy?.enabled ?? false,
      allowedDocumentTypes: policy?.allowed_document_types ?? [],
      dailyLimit: policy?.daily_limit ?? normalizeDailyLimit(platformDefaultDailyLimit),
    };
  }

  async listPlatform(
    authContext: AuthContext,
    input: OcrTenantPolicyPlatformListInput,
  ) {
    this.assertPermission(authContext, "platform.ocr.recognition.read");
    return this.repository.listPlatform(input);
  }

  async updatePlatform(
    authContext: AuthContext,
    tenantId: string,
    input: UpdatePlatformOcrTenantPolicyInput,
  ) {
    this.assertPermission(authContext, "platform.ocr.tenant_policy.manage");
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) throw Errors.notFound("租户不存在");

    const previous = await this.repository.findByTenantId(tenantId);
    const enabledAt = input.enabled
      ? previous?.enabled
        ? previous.enabled_at ?? this.nowFactory().toISOString()
        : this.nowFactory().toISOString()
      : previous?.enabled_at ?? null;
    const saved = await this.repository.upsert({
      tenantId,
      enabled: input.enabled,
      allowedDocumentTypes: input.allowed_document_types,
      dailyLimit: input.daily_limit,
      remark: input.remark,
      enabledAt,
      updatedByEmployeeId: authContext.employeeId,
    });

    await this.audit.recordBestEffort({
      action: "platform_config_update",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: tenantId,
      resourceType: "ocr_tenant_policy",
      resourceId: tenantId,
      resourceLabel: tenant.name,
      summary: `${input.enabled ? "启用" : "停用"}租户「${tenant.name}」OCR灰度`,
      metadata: {
        previous: previous
          ? auditSnapshot(previous)
          : null,
        current: auditSnapshot(saved),
      },
    });

    return {
      ...saved,
      tenant_name: tenant.name,
      tenant_status: tenant.status,
    };
  }

  private assertPermission(authContext: AuthContext, permission: string) {
    if (!authContext.isPlatformAdmin ||
      !this.accessPolicy.hasPermission(authContext, permission)) {
      throw Errors.forbidden();
    }
  }
}

function normalizeDailyLimit(value: number) {
  return Math.min(10000, Math.max(1, Math.floor(value)));
}

function auditSnapshot(input: {
  enabled: boolean;
  allowed_document_types: readonly string[];
  daily_limit: number | null;
  remark: string | null;
}) {
  return {
    enabled: input.enabled,
    allowed_document_types: input.allowed_document_types,
    daily_limit: input.daily_limit,
    remark: input.remark,
  };
}

export const ocrTenantPolicyService = new OcrTenantPolicyService();
