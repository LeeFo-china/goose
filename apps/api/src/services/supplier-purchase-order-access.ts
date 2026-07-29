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
  | "getVisibleProjectIds"
  | "canAccessProject"
>;

type SettingsRepositoryPort = {
  getSettings(tenantId: string): Promise<
    Pick<TenantSupplierSettings, "tenant_id" | "module_enabled"> | null
  >;
};

export type SupplierPurchaseOrderActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export type SupplierPurchaseOrderAccessDependencies = {
  accessPolicy?: AccessPolicyPort;
  repository?: SettingsRepositoryPort;
};

export class SupplierPurchaseOrderAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: SettingsRepositoryPort;

  constructor(dependencies: SupplierPurchaseOrderAccessDependencies = {}) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
  }

  requireRead(auth: AuthContext) {
    return this.requireScope(auth, "supplier.purchase-order.view");
  }

  requireManage(auth: AuthContext) {
    return this.requireScope(auth, "supplier.purchase-order.manage");
  }

  getVisibleProjectIds(auth: AuthContext) {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.read");
  }

  assertProjectRead(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.read");
  }

  assertProjectUpdate(auth: AuthContext, projectId: string) {
    return this.assertProject(auth, projectId, "project.update");
  }

  private async requireScope(
    auth: AuthContext,
    permission: "supplier.purchase-order.view" | "supplier.purchase-order.manage",
  ): Promise<SupplierPurchaseOrderActorScope> {
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
  ) {
    if (await this.accessPolicy.canAccessProject(auth, projectId, permission)) {
      return;
    }
    throw Errors.forbidden();
  }
}

export const supplierPurchaseOrderAccessService =
  new SupplierPurchaseOrderAccessService();
