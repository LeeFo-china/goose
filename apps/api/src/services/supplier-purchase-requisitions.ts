import { Errors } from "@/errors/error-factory";
import {
  financeCostCategoryRepository,
} from "@/repositories/finance-cost-categories";
import {
  supplierPurchaseOrdersRepository,
} from "@/repositories/supplier-purchase-orders";
import {
  supplierPurchaseRequisitionsRepository,
  type SupplierPurchaseRequisitionDetail,
  type SupplierPurchaseRequisitionScope,
} from "@/repositories/supplier-purchase-requisitions";
import type {
  SupplierPurchaseRequisitionCancelInput,
  SupplierPurchaseRequisitionCatalogQuery,
  SupplierPurchaseRequisitionConvertInput,
  SupplierPurchaseRequisitionCostCategoryListQuery,
  SupplierPurchaseRequisitionDraftInput,
  SupplierPurchaseRequisitionItemListQuery,
  SupplierPurchaseRequisitionListQuery,
  SupplierPurchaseRequisitionOptionQuery,
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
  | "getVisibleProjectUpdateIds"
  | "assertProjectUpdate"
>;
type RequisitionRepositoryPort = Pick<
  typeof supplierPurchaseRequisitionsRepository,
  | "listRequisitions"
  | "findRequisitionScope"
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
  "assertCanCreatePurchaseOrderForTenant"
>;
type RequisitionOptionsRepositoryPort = Pick<
  typeof supplierPurchaseOrdersRepository,
  "listProjectOptions" | "listSupplierOptions" | "listCatalog"
>;
type RequisitionCostCategoryRepositoryPort = Pick<
  typeof financeCostCategoryRepository,
  "list"
>;

export type SupplierPurchaseRequisitionsServiceDependencies = {
  access?: RequisitionAccessPort;
  repository?: RequisitionRepositoryPort;
  optionsRepository?: RequisitionOptionsRepositoryPort;
  costCategoryRepository?: RequisitionCostCategoryRepositoryPort;
  tenantSuppliers?: TenantSupplierEligibilityPort;
  nowFactory?: () => Date;
};

export class SupplierPurchaseRequisitionsService {
  private readonly access: RequisitionAccessPort;
  private readonly repository: RequisitionRepositoryPort;
  private readonly optionsRepository: RequisitionOptionsRepositoryPort;
  private readonly costCategoryRepository:
    RequisitionCostCategoryRepositoryPort;
  private readonly tenantSuppliers: TenantSupplierEligibilityPort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: SupplierPurchaseRequisitionsServiceDependencies = {},
  ) {
    this.access = dependencies.access ??
      supplierPurchaseRequisitionAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseRequisitionsRepository;
    this.optionsRepository = dependencies.optionsRepository ??
      supplierPurchaseOrdersRepository;
    this.costCategoryRepository = dependencies.costCategoryRepository ??
      financeCostCategoryRepository;
    this.tenantSuppliers = dependencies.tenantSuppliers ??
      tenantSuppliersService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
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
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
    return this.requireRequisition(scope.tenantId, requisitionId);
  }

  async listItems(
    auth: AuthContext,
    requisitionId: string,
    query: SupplierPurchaseRequisitionItemListQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
    return this.repository.listItems({
      tenant_id: scope.tenantId,
      requisition_id: requisitionId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async listProjectOptions(
    auth: AuthContext,
    query: SupplierPurchaseRequisitionOptionQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.optionsRepository.listProjectOptions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listSupplierOptions(
    auth: AuthContext,
    query: SupplierPurchaseRequisitionOptionQuery,
  ) {
    const scope = await this.access.requireView(auth);
    return this.optionsRepository.listSupplierOptions({
      tenant_id: scope.tenantId,
      checked_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listCatalog(
    auth: AuthContext,
    query: SupplierPurchaseRequisitionCatalogQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    return this.optionsRepository.listCatalog({
      tenant_id: scope.tenantId,
      tenant_supplier_id: query.tenantSupplierId,
      priced_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listCostCategories(
    auth: AuthContext,
    query: SupplierPurchaseRequisitionCostCategoryListQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    return this.costCategoryRepository.list(scope.tenantId, {
      ...query,
      status: "active",
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
      const visibleProjectIds = await this.access
        .getVisibleProjectUpdateIds(auth);
      const requisition = await this.requireRequisitionScope(
        scope.tenantId,
        requisitionId,
        visibleProjectIds,
      );
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
    const visibleProjectIds = await this.access
      .getVisibleProjectUpdateIds(auth);
    const requisition = await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
    await this.tenantSuppliers.assertCanCreatePurchaseOrderForTenant(
      scope.tenantId,
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
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const requisition = await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
    // draft 尚不可能存在审核事件，始终阻断；pending 必须绑定当前版本。
    // 终态可能是相同 actor/key/fingerprint 的历史重放，数据库会先查命令事件，
    // 再锁行校验状态和版本，因此保留权限检查后交给 event-first RPC 判定。
    if (requisition.status === "draft") {
      throw Errors.business(
        409,
        "采购申请当前状态不允许审批",
        "SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT",
      );
    }
    if (
      requisition.status === "pending_approval" &&
      requisition.version !== input.expected_version
    ) {
      throw Errors.business(
        409,
        "采购申请版本已变化，请刷新后重试",
        "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
      );
    }
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
    const visibleProjectIds = await this.access
      .getVisibleProjectUpdateIds(auth);
    await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
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
    const visibleProjectIds = await this.access
      .getVisibleProjectUpdateIds(auth);
    await this.requireRequisitionScope(
      scope.tenantId,
      requisitionId,
      visibleProjectIds,
    );
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

  private async requireRequisitionScope(
    tenantId: string,
    requisitionId: string,
    visibleProjectIds: string[] | null,
  ): Promise<SupplierPurchaseRequisitionScope> {
    const requisition = await this.repository.findRequisitionScope({
      tenant_id: tenantId,
      requisition_id: requisitionId,
      visible_project_ids: visibleProjectIds,
    });
    if (requisition) return requisition;
    throw Errors.business(
      404,
      "供应商采购申请不存在",
      "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
    );
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
    requisition: SupplierPurchaseRequisitionScope,
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
