import { Errors } from "@/errors/error-factory";
import { tenantSuppliersRepository } from "@/repositories/tenant-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  | "assertTenantContext"
  | "assertPermission"
  | "getVisibleProjectIds"
  | "canAccessProject"
>;
type SettingsRepositoryPort = {
  getSettings(tenantId: string): Promise<{
    tenant_id: string;
    module_enabled: boolean;
  } | null>;
};

export type SupplierPurchaseRequisitionActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export type SupplierPurchaseRequisitionAccessDependencies = {
  accessPolicy?: AccessPolicyPort;
  repository?: SettingsRepositoryPort;
};

type RequisitionPermission =
  | "supplier.purchase-requisition.view"
  | "supplier.purchase-requisition.manage"
  | "supplier.purchase-requisition.approve";

export class SupplierPurchaseRequisitionAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: SettingsRepositoryPort;

  constructor(
    dependencies: SupplierPurchaseRequisitionAccessDependencies = {},
  ) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
  }

  requireView(auth: AuthContext) {
    return this.requireScope(auth, "supplier.purchase-requisition.view");
  }

  requireManage(auth: AuthContext) {
    return this.requireScope(auth, "supplier.purchase-requisition.manage");
  }

  requireApprove(auth: AuthContext) {
    return this.requireScope(auth, "supplier.purchase-requisition.approve");
  }

  requireFinanceBudgetManage(auth: AuthContext) {
    this.accessPolicy.assertPermission(auth, "finance.budget.manage");
  }

  getVisibleProjectIds(auth: AuthContext) {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.read");
  }

  getVisibleProjectUpdateIds(auth: AuthContext) {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.update");
  }

  assertProjectRead(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.read");
  }

  assertProjectUpdate(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.update");
  }

  private async requireScope(
    auth: AuthContext,
    permission: RequisitionPermission,
  ): Promise<SupplierPurchaseRequisitionActorScope> {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, permission);
    if (!auth.authUserId || !auth.employeeId) {
      throw Errors.forbidden();
    }

    const settings = await this.repository.getSettings(tenantId);
    if (!settings?.module_enabled) {
      throw Errors.business(
        409,
        "供应商模块未启用",
        "SUPPLIER_MODULE_DISABLED",
      );
    }
    return {
      tenantId,
      authUserId: auth.authUserId,
      employeeId: auth.employeeId,
    };
  }

  private async assertProject(
    auth: AuthContext,
    projectId: string,
    permission: "project.read" | "project.update",
  ): Promise<void> {
    const canAccess = await this.accessPolicy.canAccessProject(
      auth,
      projectId,
      permission,
    );
    if (!canAccess) throw Errors.forbidden();
  }
}

export const supplierPurchaseRequisitionAccessService =
  new SupplierPurchaseRequisitionAccessService();
