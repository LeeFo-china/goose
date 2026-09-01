import { Errors } from "@/errors/error-factory";
import {
  tenantSuppliersRepository,
  type TenantSupplierDetail,
  type TenantSupplierSettings,
} from "@/repositories/tenant-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  resolveSupplierRelationshipAccess,
  type SupplierAccessDecision,
  type SupplierRelationshipAccessInput,
} from "@/services/supplier-ownership-access";

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;

type RelationshipRepositoryPort = {
  getSettings(tenantId: string): Promise<
    Pick<TenantSupplierSettings, "tenant_id" | "module_enabled"> | null
  >;
  findRelationship(input: {
    tenant_id: string;
    id: string;
  }): Promise<TenantSupplierDetail | null>;
};
type RelationshipAccessPort = (
  input: SupplierRelationshipAccessInput,
) => SupplierAccessDecision;

export type SupplierProxyScope = {
  tenantId: string;
  tenantSupplierId: string;
  supplierId: string;
  authUserId: string;
  employeeId: string;
};

export type SupplierProductAccessDependencies = {
  accessPolicy?: AccessPolicyPort;
  repository?: RelationshipRepositoryPort;
  relationshipAccess?: RelationshipAccessPort;
};

export class SupplierProductAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: RelationshipRepositoryPort;
  private readonly relationshipAccess: RelationshipAccessPort;

  constructor(dependencies: SupplierProductAccessDependencies = {}) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
    this.relationshipAccess = dependencies.relationshipAccess ??
      resolveSupplierRelationshipAccess;
  }

  requireProductRead(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    const permission = [
      "supplier.product.view",
      "supplier.product.manage",
      "supplier.cost-price.view",
      "supplier.cost-price.manage",
    ].find((candidate) =>
      auth.permissions.some(({ code }) => code === candidate)
    ) ?? "supplier.product.view";
    return this.requireScope(
      auth,
      tenantSupplierId,
      [permission],
      false,
    );
  }

  requireProductWrite(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      ["supplier.product.manage"],
      true,
    );
  }

  async requirePurchasableProductWrite(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      ["supplier.product.manage", "supplier.cost-price.manage"],
      true,
    );
  }

  requirePurchasableSkuPriceRead(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      ["supplier.product.manage", "supplier.cost-price.view"],
      true,
    );
  }

  requirePurchasableSkuWrite(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      ["supplier.product.manage", "supplier.cost-price.manage"],
      true,
    );
  }

  requirePriceRead(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    const permission = [
      "supplier.cost-price.view",
      "supplier.cost-price.manage",
    ].find((candidate) =>
      auth.permissions.some(({ code }) => code === candidate)
    ) ?? "supplier.cost-price.view";
    return this.requireScope(
      auth,
      tenantSupplierId,
      [permission],
      false,
    );
  }

  requirePriceWrite(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      ["supplier.cost-price.manage"],
      true,
    );
  }

  private async requireScope(
    auth: AuthContext,
    tenantSupplierId: string,
    permissions: readonly string[],
    write: boolean,
  ): Promise<SupplierProxyScope> {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    for (const permission of permissions) {
      this.accessPolicy.assertPermission(auth, permission);
    }

    if (!auth.employeeId || !auth.authUserId) {
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

    const relationship = await this.repository.findRelationship({
      tenant_id: tenantId,
      id: tenantSupplierId,
    });
    if (!relationship) {
      throw Errors.business(
        404,
        "租户供应商合作关系不存在",
        "TENANT_SUPPLIER_NOT_FOUND",
      );
    }

    if (relationship.tenant_id !== tenantId) {
      throw Errors.business(
        404,
        "租户供应商合作关系不存在",
        "TENANT_SUPPLIER_NOT_FOUND",
      );
    }

    const operation = write ? "write" : "read";
    const decision = this.relationshipAccess({
      relationshipStatus: relationship.relationship_status,
      operation,
      permissionGranted: true,
    });
    this.assertDecision(decision, relationship, write);

    const tenantOwnedPrivateSupplier =
      relationship.supplier.ownership_scope === "tenant" &&
      relationship.supplier.owner_tenant_id === tenantId;
    const platformReady =
      relationship.supplier.onboarding_status === "approved" &&
      relationship.supplier.operational_status === "active";
    const privateReady = tenantOwnedPrivateSupplier &&
      relationship.supplier.operational_status === "active";

    if (write && !platformReady && !privateReady) {
      throw Errors.business(
        409,
        "供应商当前不满足代录条件",
        "SUPPLIER_ORDER_NOT_ELIGIBLE",
        {
          relationship_status: relationship.relationship_status,
          supplier_onboarding_status:
            relationship.supplier.onboarding_status,
          supplier_operational_status:
            relationship.supplier.operational_status,
        },
      );
    }

    return {
      tenantId,
      tenantSupplierId: relationship.id,
      supplierId: relationship.supplier_id,
      authUserId: auth.authUserId,
      employeeId: auth.employeeId,
    };
  }

  private assertDecision(
    decision: SupplierAccessDecision,
    relationship: TenantSupplierDetail,
    write: boolean,
  ): void {
    if (decision.visible && (!write || decision.writable)) return;

    if (decision.reason === "permission_denied") {
      throw Errors.forbidden();
    }
    if (decision.reason === "foreign_tenant") {
      throw Errors.business(
        404,
        "租户供应商合作关系不存在",
        "TENANT_SUPPLIER_NOT_FOUND",
      );
    }
    throw Errors.business(
      409,
      "供应商当前不满足代录条件",
      "SUPPLIER_ORDER_NOT_ELIGIBLE",
      {
        relationship_status: relationship.relationship_status,
        supplier_onboarding_status: relationship.supplier.onboarding_status,
        supplier_operational_status: relationship.supplier.operational_status,
      },
    );
  }
}

export const supplierProductAccessService =
  new SupplierProductAccessService();
