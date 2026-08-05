import { Errors } from "@/errors/error-factory";
import {
  supplierOnboardingRepository,
  type SupplierOnboardingCreateResult,
  type SupplierOnboardingRepository,
} from "@/repositories/supplier-onboarding";
import type { SupplierOnboardingCreateInput } from "@/schema/supplier-onboarding";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type SupplierOnboardingRepositoryPort = Pick<
  SupplierOnboardingRepository,
  "create" | "findByCreditCode"
>;

export type SupplierOnboardingServiceDependencies = {
  repository?: SupplierOnboardingRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  idFactory?: () => string;
};

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  SUPPLIER_IDENTITY_CONFLICT: { status: 409, message: "统一社会信用代码已存在" },
  SUPPLIER_FILE_INVALID: { status: 400, message: "营业执照文件无效或无权使用" },
  SUPPLIER_OCR_RECORD_INVALID: { status: 400, message: "OCR识别记录无效或无权使用" },
  SUPPLIER_BUSINESS_LICENSE_TYPE_MISSING: { status: 500, message: "营业执照资质类型缺失" },
  SUPPLIER_IDEMPOTENCY_CONFLICT: { status: 409, message: "幂等键已用于其他供应商操作" },
  SUPPLIER_VALIDATION_ERROR: { status: 400, message: "供应商准入参数无效" },
};

export class SupplierOnboardingService {
  private readonly repository: SupplierOnboardingRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly idFactory: () => string;

  constructor(dependencies: SupplierOnboardingServiceDependencies = {}) {
    this.repository = dependencies.repository ?? supplierOnboardingRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
  }

  async create(
    auth: AuthContext,
    input: SupplierOnboardingCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.requireManage(auth);
    const result = await this.mapRpcError(() => this.repository.create({
      ...input,
      supplier_id: this.idFactory(),
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    }));
    if (!result.idempotent) await this.recordAudit(actor, result);
    return result;
  }

  async checkIdentity(auth: AuthContext, unifiedSocialCreditCode: string) {
    this.requireManage(auth);
    const normalized = unifiedSocialCreditCode.trim().toUpperCase();
    const supplier = await this.repository.findByCreditCode(normalized);
    return { exists: Boolean(supplier), supplier };
  }

  private requireManage(auth: AuthContext) {
    const isPlatformIdentity =
      auth.isPlatformStaff === true ||
      auth.isPlatformAdmin === true;
    if (
      !isPlatformIdentity ||
      auth.tenantId !== null ||
      !auth.employeeId ||
      !auth.authUserId
    ) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(auth, "platform.supplier.manage");
    return { authUserId: auth.authUserId, employeeId: auth.employeeId };
  }

  private async mapRpcError<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const code = extractSupplierErrorCode(error);
      if (!code) throw error;
      const mapped = ERROR_MAP[code] ?? {
        status: 400,
        message: "供应商准入操作失败",
      };
      throw Errors.business(mapped.status, mapped.message, code, {
        code,
      });
    }
  }

  private recordAudit(
    actor: { authUserId: string; employeeId: string },
    result: SupplierOnboardingCreateResult,
  ) {
    return this.audit.recordBestEffort({
      action: "platform_supplier_create",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "supplier",
      resourceId: result.supplier.id,
      resourceLabel: result.supplier.name,
      status: "success",
      summary: `创建供应商准入「${result.supplier.name}」`,
      metadata: {
        supplier_id: result.supplier.id,
        qualification_id: result.qualification.id,
        primary_contact_id: result.primary_contact.id,
        idempotent: result.idempotent,
      },
    });
  }
}

function extractSupplierErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const values = [
    "message" in error ? error.message : null,
    "code" in error ? error.code : null,
  ];
  return values.find((value): value is string =>
    typeof value === "string" && value.startsWith("SUPPLIER_")
  ) ?? null;
}

export const supplierOnboardingService = new SupplierOnboardingService();
