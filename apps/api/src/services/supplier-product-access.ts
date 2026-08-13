import { Errors } from "@/errors/error-factory";
import {
  tenantSuppliersRepository,
  type TenantSupplierDetail,
  type TenantSupplierSettings,
} from "@/repositories/tenant-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  resolveSupplierOwnershipAccess,
  type SupplierAccessDecision,
  type SupplierOwnershipAccessInput,
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
type OwnershipAccessPort = (
  input: SupplierOwnershipAccessInput,
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
  ownershipAccess?: OwnershipAccessPort;
};

export class SupplierProductAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: RelationshipRepositoryPort;
  private readonly ownershipAccess: OwnershipAccessPort;

  constructor(dependencies: SupplierProductAccessDependencies = {}) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
    this.ownershipAccess = dependencies.ownershipAccess ??
      resolveSupplierOwnershipAccess;
  }

  requireProductRead(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      "supplier.product.view",
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
      "supplier.product.manage",
      true,
    );
  }

  requirePriceRead(
    auth: AuthContext,
    tenantSupplierId: string,
  ) {
    return this.requireScope(
      auth,
      tenantSupplierId,
      "supplier.cost-price.view",
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
      "supplier.cost-price.manage",
      true,
    );
  }

  private async requireScope(
    auth: AuthContext,
    tenantSupplierId: string,
    permission: string,
    write: boolean,
  ): Promise<SupplierProxyScope> {
    const tenantId = this.accessPolicy.assertTenantContext(auth);
    this.accessPolicy.assertPermission(auth, permission);

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

    const operation = write ? "write" : "read";
    const decision = this.ownershipAccess({
      actor: { kind: "tenant", tenantId },
      resourceKind: "product",
      ownership: {
        ownershipScope: "tenant",
        ownerTenantId: relationship.tenant_id,
      },
      relationshipStatus: relationship.relationship_status,
      operation,
      permissionGranted: true,
    });
    this.assertDecision(decision, relationship, write);

    if (
      write &&
      (
        relationship.supplier.onboarding_status !== "approved" ||
        relationship.supplier.operational_status !== "active"
      )
    ) {
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
