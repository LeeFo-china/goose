import { Errors } from "@/errors/error-factory";
import {
  tenantSuppliersRepository,
  type TenantSupplierSettings,
} from "@/repositories/tenant-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  | "assertTenantContext"
  | "assertPermission"
  | "canAccessProject"
  | "getVisibleProjectIds"
>;
type SettingsRepositoryPort = {
  getSettings(tenantId: string): Promise<
    Pick<TenantSupplierSettings, "tenant_id" | "module_enabled"> | null
  >;
};
type SupplierPaymentPermission =
  | "supplier.payable.view"
  | "supplier.payment-request.view"
  | "supplier.payment-request.manage"
  | "supplier.payment-request.approve"
  | "supplier.payment-request.pay";

export type SupplierPaymentActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};
export type SupplierPaymentAccessDependencies = {
  accessPolicy?: AccessPolicyPort;
  repository?: SettingsRepositoryPort;
};

export class SupplierPaymentAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: SettingsRepositoryPort;

  constructor(dependencies: SupplierPaymentAccessDependencies = {}) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
  }

  requirePayableRead(auth: AuthContext) {
    return this.requireScope(auth, "supplier.payable.view");
  }

  requireRequestRead(auth: AuthContext) {
    return this.requireScope(auth, "supplier.payment-request.view");
  }

  requireRequestManage(auth: AuthContext) {
    return this.requireScope(auth, "supplier.payment-request.manage");
  }

  requireRequestApprove(auth: AuthContext) {
    return this.requireScope(auth, "supplier.payment-request.approve");
  }

  requirePayment(auth: AuthContext) {
    return this.requireScope(auth, "supplier.payment-request.pay");
  }

  assertProjectRead(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.read");
  }

  assertProjectUpdate(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.update");
  }

  getVisibleProjectIds(auth: AuthContext) {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.read");
  }

  private async requireScope(
    auth: AuthContext,
    permission: SupplierPaymentPermission,
  ): Promise<SupplierPaymentActorScope> {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, permission);
    if (!auth.authUserId || !auth.employeeId) throw Errors.forbidden();

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
    if (await this.accessPolicy.canAccessProject(auth, projectId, permission)) {
      return;
    }
    throw Errors.forbidden();
  }
}

export const supplierPaymentAccessService =
  new SupplierPaymentAccessService();
