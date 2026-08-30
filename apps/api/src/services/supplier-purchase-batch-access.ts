import type { SupplierPurchaseBatchStatus } from "@gooes/domain";

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

type BatchPermission =
  | "supplier.purchase-requisition.view"
  | "supplier.purchase-requisition.manage"
  | "supplier.purchase-requisition.approve";

export type SupplierPurchaseBatchActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export type SupplierPurchaseBatchAccessDependencies = {
  accessPolicy?: AccessPolicyPort;
  repository?: SettingsRepositoryPort;
};

export type SupplierPurchaseBatchActions = {
  can_edit: boolean;
  can_submit: boolean;
  can_review: boolean;
  can_withdraw: boolean;
  can_cancel: boolean;
  can_create_supplier: boolean;
  can_create_catalog: boolean;
  can_create_purchasable_product: boolean;
};

export type SupplierPurchaseBatchActionInput = {
  status: SupplierPurchaseBatchStatus;
  createdByEmployeeId: string;
  submittedByEmployeeId: string | null;
  actorEmployeeId: string | null;
  permissions: readonly string[];
  canReadProject: boolean;
  canUpdateProject: boolean;
  workflowEnabled?: boolean;
  workflowCanReview?: boolean;
  workflowCanWithdraw?: boolean;
};

function hasPermission(
  permissions: readonly string[],
  permission: string,
): boolean {
  return permissions.includes(permission);
}

export function deriveSupplierPurchaseBatchActions(
  input: SupplierPurchaseBatchActionInput,
): SupplierPurchaseBatchActions {
  const hasActor = Boolean(input.actorEmployeeId);
  const canEditRejected = input.workflowEnabled === true &&
    input.status === "rejected" &&
    input.actorEmployeeId === input.submittedByEmployeeId;
  const canManageDraft = hasActor &&
    (input.status === "draft" || canEditRejected) &&
    input.canUpdateProject && hasPermission(
      input.permissions,
      "supplier.purchase-requisition.manage",
    );
  const canReviewBoundary = hasActor && input.status === "pending_approval" &&
    input.canReadProject &&
    input.actorEmployeeId !== input.createdByEmployeeId &&
    input.actorEmployeeId !== input.submittedByEmployeeId;
  const canReview = canReviewBoundary && (input.workflowEnabled
    ? input.workflowCanReview === true
    : hasPermission(
      input.permissions,
      "supplier.purchase-requisition.approve",
    ));
  const canWithdraw = input.workflowEnabled === true &&
    input.workflowCanWithdraw === true && hasActor &&
    input.status === "pending_approval" && input.canUpdateProject &&
    input.actorEmployeeId === input.submittedByEmployeeId &&
    hasPermission(input.permissions, "supplier.purchase-requisition.manage");
  const canCancel = hasActor &&
    (input.status === "draft" || input.status === "pending_approval") &&
    input.canUpdateProject && hasPermission(
      input.permissions,
      "supplier.purchase-requisition.manage",
    );

  return {
    can_edit: canManageDraft,
    can_submit: canManageDraft && input.status === "draft",
    can_review: canReview,
    can_withdraw: canWithdraw,
    can_cancel: canCancel,
    can_create_supplier: canManageDraft &&
      hasPermission(input.permissions, "supplier.master.manage"),
    can_create_catalog: canManageDraft &&
      hasPermission(input.permissions, "supplier.catalog.manage"),
    can_create_purchasable_product: canManageDraft &&
      hasPermission(input.permissions, "supplier.product.manage") &&
      hasPermission(input.permissions, "supplier.cost-price.manage"),
  };
}

export class SupplierPurchaseBatchAccessService {
  private readonly accessPolicy: AccessPolicyPort;
  private readonly repository: SettingsRepositoryPort;

  constructor(dependencies: SupplierPurchaseBatchAccessDependencies = {}) {
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.repository = dependencies.repository ?? tenantSuppliersRepository;
  }

  requireView(auth: AuthContext): Promise<SupplierPurchaseBatchActorScope> {
    return this.requireScope(auth, "supplier.purchase-requisition.view");
  }

  requireManage(auth: AuthContext): Promise<SupplierPurchaseBatchActorScope> {
    return this.requireScope(auth, "supplier.purchase-requisition.manage");
  }

  requireApprove(auth: AuthContext): Promise<SupplierPurchaseBatchActorScope> {
    return this.requireScope(auth, "supplier.purchase-requisition.approve");
  }

  requireFinanceBudgetManage(auth: AuthContext): void {
    this.accessPolicy.assertPermission(auth, "finance.budget.manage");
  }

  getVisibleProjectIds(auth: AuthContext): Promise<string[] | null> {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.read");
  }

  getVisibleProjectUpdateIds(auth: AuthContext): Promise<string[] | null> {
    return this.accessPolicy.getVisibleProjectIds(auth, "project.update");
  }

  assertProjectRead(auth: AuthContext, projectId: string): Promise<void> {
    return this.assertProject(auth, projectId, "project.read");
  }

  assertProjectUpdate(auth: AuthContext, projectId: string): Promise<void> {
    return this.assertProject(auth, projectId, "project.update");
  }

  private async requireScope(
    auth: AuthContext,
    permission: BatchPermission,
  ): Promise<SupplierPurchaseBatchActorScope> {
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

export const supplierPurchaseBatchAccessService =
  new SupplierPurchaseBatchAccessService();
