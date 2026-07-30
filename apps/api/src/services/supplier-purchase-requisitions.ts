import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseRequisitionsRepository,
  type SupplierPurchaseRequisitionDetail,
  type SupplierPurchaseRequisitionRecord,
} from "@/repositories/supplier-purchase-requisitions";
import type {
  SupplierPurchaseRequisitionCancelInput,
  SupplierPurchaseRequisitionConvertInput,
  SupplierPurchaseRequisitionDraftInput,
  SupplierPurchaseRequisitionItemListQuery,
  SupplierPurchaseRequisitionListQuery,
  SupplierPurchaseRequisitionReviewInput,
  SupplierPurchaseRequisitionSubmitInput,
} from "@/schema/supplier-purchase-requisitions";
import type { AuthContext } from "@/services/authorization";
import {
  supplierPurchaseRequisitionAccessService,
} from "@/services/supplier-purchase-requisition-access";
import { tenantSuppliersService } from "@/services/tenant-suppliers";

type RequisitionAccessPort = Pick<
  typeof supplierPurchaseRequisitionAccessService,
  | "requireView"
  | "requireManage"
  | "requireApprove"
  | "requireFinanceBudgetManage"
  | "getVisibleProjectIds"
  | "assertProjectRead"
  | "assertProjectUpdate"
>;
type RequisitionRepositoryPort = Pick<
  typeof supplierPurchaseRequisitionsRepository,
  | "listRequisitions"
  | "findRequisition"
  | "listItems"
  | "saveDraft"
  | "submit"
  | "review"
  | "cancel"
  | "convert"
>;
type TenantSupplierEligibilityPort = Pick<
  typeof tenantSuppliersService,
  "assertCanCreatePurchaseOrder"
>;

export type SupplierPurchaseRequisitionsServiceDependencies = {
  access?: RequisitionAccessPort;
  repository?: RequisitionRepositoryPort;
  tenantSuppliers?: TenantSupplierEligibilityPort;
};

export class SupplierPurchaseRequisitionsService {
  private readonly access: RequisitionAccessPort;
  private readonly repository: RequisitionRepositoryPort;
  private readonly tenantSuppliers: TenantSupplierEligibilityPort;

  constructor(
    dependencies: SupplierPurchaseRequisitionsServiceDependencies = {},
  ) {
    this.access = dependencies.access ??
      supplierPurchaseRequisitionAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseRequisitionsRepository;
    this.tenantSuppliers = dependencies.tenantSuppliers ??
      tenantSuppliersService;
  }

  async listRequisitions(
    auth: AuthContext,
    query: SupplierPurchaseRequisitionListQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listRequisitions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.budget_status
        ? { budget_status: query.budget_status }
        : {}),
      ...(query.project_id ? { project_id: query.project_id } : {}),
      ...(query.tenant_supplier_id
        ? { tenant_supplier_id: query.tenant_supplier_id }
        : {}),
    });
  }

  async getRequisition(
    auth: AuthContext,
    requisitionId: string,
  ): Promise<SupplierPurchaseRequisitionDetail> {
    const scope = await this.access.requireView(auth);
    const detail = await this.requireRequisition(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectRead(
      auth,
      detail.requisition.project_id,
    );
    return detail;
  }

  async listItems(
    auth: AuthContext,
    requisitionId: string,
    query: SupplierPurchaseRequisitionItemListQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const detail = await this.requireRequisition(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectRead(
      auth,
      detail.requisition.project_id,
    );
    return this.repository.listItems({
      tenant_id: scope.tenantId,
      requisition_id: requisitionId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async saveDraft(
    auth: AuthContext,
    requisitionId: string,
    input: SupplierPurchaseRequisitionDraftInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    if (input.expected_version > 0) {
      const requisition = await this.requireRequisitionRecord(
        scope.tenantId,
        requisitionId,
      );
      await this.access.assertProjectUpdate(auth, requisition.project_id);
      this.assertDraftScopeUnchanged(requisition, input);
    } else {
      await this.access.assertProjectUpdate(auth, input.project_id);
    }
    return this.repository.saveDraft({
      tenant_id: scope.tenantId,
      requisition_id: requisitionId,
      project_id: input.project_id,
      tenant_supplier_id: input.tenant_supplier_id,
      expected_version: input.expected_version,
      expected_delivery_date: input.expected_delivery_date ?? null,
      reason: input.reason,
      remark: input.remark ?? null,
      items: input.items,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async submit(
    auth: AuthContext,
    requisitionId: string,
    input: SupplierPurchaseRequisitionSubmitInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const requisition = await this.requireRequisitionRecord(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectUpdate(auth, requisition.project_id);
    await this.tenantSuppliers.assertCanCreatePurchaseOrder(
      auth,
      requisition.tenant_supplier_id,
    );
    return this.repository.submit(
      this.commandContext(scope, requisitionId, input, idempotencyKey),
    );
  }

  async review(
    auth: AuthContext,
    requisitionId: string,
    input: SupplierPurchaseRequisitionReviewInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireApprove(auth);
    const requisition = await this.requireRequisitionRecord(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectRead(auth, requisition.project_id);
    if (requisition.created_by_employee_id === scope.employeeId) {
      throw Errors.business(
        409,
        "申请人不能审批自己提交的采购申请",
        "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
      );
    }
    if (
      input.action === "approve" &&
      requisition.budget_status === "over_budget"
    ) {
      await this.access.requireFinanceBudgetManage(auth);
    }
    return this.repository.review({
      ...this.commandContext(
        scope,
        requisitionId,
        input,
        idempotencyKey,
      ),
      action: input.action,
      remark: input.remark ?? null,
    });
  }

  async cancel(
    auth: AuthContext,
    requisitionId: string,
    input: SupplierPurchaseRequisitionCancelInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const requisition = await this.requireRequisitionRecord(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectUpdate(auth, requisition.project_id);
    return this.repository.cancel({
      ...this.commandContext(
        scope,
        requisitionId,
        input,
        idempotencyKey,
      ),
      reason: input.reason,
    });
  }

  async convert(
    auth: AuthContext,
    requisitionId: string,
    input: SupplierPurchaseRequisitionConvertInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const requisition = await this.requireRequisitionRecord(
      scope.tenantId,
      requisitionId,
    );
    await this.access.assertProjectUpdate(auth, requisition.project_id);
    return this.repository.convert({
      ...this.commandContext(
        scope,
        requisitionId,
        input,
        idempotencyKey,
      ),
      purchase_order_id: input.purchase_order_id,
    });
  }

  private async requireRequisition(
    tenantId: string,
    requisitionId: string,
  ): Promise<SupplierPurchaseRequisitionDetail> {
    const detail = await this.repository.findRequisition(
      tenantId,
      requisitionId,
    );
    if (detail) return detail;
    throw Errors.business(
      404,
      "供应商采购申请不存在",
      "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
    );
  }

  private async requireRequisitionRecord(
    tenantId: string,
    requisitionId: string,
  ): Promise<SupplierPurchaseRequisitionRecord> {
    return (await this.requireRequisition(tenantId, requisitionId))
      .requisition;
  }

  private commandContext(
    scope: {
      tenantId: string;
      authUserId: string;
      employeeId: string;
    },
    requisitionId: string,
    input: { expected_version: number },
    idempotencyKey: string,
  ) {
    return {
      tenant_id: scope.tenantId,
      requisition_id: requisitionId,
      expected_version: input.expected_version,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    };
  }

  private assertDraftScopeUnchanged(
    requisition: SupplierPurchaseRequisitionRecord,
    input: Pick<
      SupplierPurchaseRequisitionDraftInput,
      "project_id" | "tenant_supplier_id"
    >,
  ): void {
    if (
      requisition.project_id === input.project_id &&
      requisition.tenant_supplier_id === input.tenant_supplier_id
    ) {
      return;
    }
    throw Errors.business(
      409,
      "采购申请不允许变更所属项目或供应商关系",
      "SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT",
    );
  }
}

export const supplierPurchaseRequisitionsService =
  new SupplierPurchaseRequisitionsService();
