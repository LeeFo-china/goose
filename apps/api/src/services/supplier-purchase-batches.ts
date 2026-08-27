import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseBatchesRepository,
  type SupplierPurchaseBatchCommandResult,
} from "@/repositories/supplier-purchase-batches";
import type {
  SupplierPurchaseBatchCancelInput,
  SupplierPurchaseBatchCatalogQuery,
  SupplierPurchaseBatchCostCategoryQuery,
  SupplierPurchaseBatchDraftInput,
  SupplierPurchaseBatchItemListQuery,
  SupplierPurchaseBatchListQuery,
  SupplierPurchaseBatchOrderListQuery,
  SupplierPurchaseBatchProjectOptionQuery,
  SupplierPurchaseBatchRequisitionListQuery,
  SupplierPurchaseBatchReviewInput,
  SupplierPurchaseBatchSubmitInput,
} from "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";
import {
  deriveSupplierPurchaseBatchActions,
  supplierPurchaseBatchAccessService,
} from "@/services/supplier-purchase-batch-access";

type BatchAccessPort = Pick<
  typeof supplierPurchaseBatchAccessService,
  | "requireView"
  | "requireManage"
  | "requireApprove"
  | "requireFinanceBudgetManage"
  | "getVisibleProjectIds"
  | "getVisibleProjectUpdateIds"
  | "assertProjectRead"
  | "assertProjectUpdate"
>;
type BatchRepositoryPort = Pick<
  typeof supplierPurchaseBatchesRepository,
  | "listBatches"
  | "findBatch"
  | "listItems"
  | "listRequisitions"
  | "listOrders"
  | "listProjectOptions"
  | "listCostCategories"
  | "listCatalog"
  | "saveDraft"
  | "submit"
  | "review"
  | "cancel"
>;

export type SupplierPurchaseBatchesServiceDependencies = {
  access?: BatchAccessPort;
  repository?: BatchRepositoryPort;
  nowFactory?: () => Date;
};

type ActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export class SupplierPurchaseBatchesService {
  private readonly access: BatchAccessPort;
  private readonly repository: BatchRepositoryPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: SupplierPurchaseBatchesServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierPurchaseBatchAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseBatchesRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listBatches(
    auth: AuthContext,
    query: SupplierPurchaseBatchListQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listBatches({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
    });
  }

  async getBatch(auth: AuthContext, batchId: string) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const batch = await this.requireBatchInScope(
      scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    const permissions = auth.permissions.map(({ code }) => code);
    const updateProjectIds = permissions.includes("project.update")
      ? await this.access.getVisibleProjectUpdateIds(auth)
      : [];
    return {
      ...batch,
      actions: deriveSupplierPurchaseBatchActions({
        status: batch.status,
        createdByEmployeeId: batch.created_by_employee_id,
        actorEmployeeId: scope.employeeId,
        permissions,
        canReadProject: true,
        canUpdateProject: projectIsVisible(
          batch.project_id,
          updateProjectIds,
        ),
      }),
    };
  }

  listItems(
    auth: AuthContext,
    batchId: string,
    query: SupplierPurchaseBatchItemListQuery,
  ) {
    return this.listChild(auth, batchId, query, "listItems");
  }

  listRequisitions(
    auth: AuthContext,
    batchId: string,
    query: SupplierPurchaseBatchRequisitionListQuery,
  ) {
    return this.listChild(auth, batchId, query, "listRequisitions");
  }

  listOrders(
    auth: AuthContext,
    batchId: string,
    query: SupplierPurchaseBatchOrderListQuery,
  ) {
    return this.listChild(auth, batchId, query, "listOrders");
  }

  async listProjectOptions(
    auth: AuthContext,
    query: SupplierPurchaseBatchProjectOptionQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listProjectOptions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listCostCategories(
    auth: AuthContext,
    query: SupplierPurchaseBatchCostCategoryQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    return this.repository.listCostCategories({
      tenant_id: scope.tenantId,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listCatalog(
    auth: AuthContext,
    query: SupplierPurchaseBatchCatalogQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    await this.access.assertProjectUpdate(auth, query.projectId);
    return this.repository.listCatalog({
      tenant_id: scope.tenantId,
      project_id: query.projectId,
      priced_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.categoryId ? { category_id: query.categoryId } : {}),
      ...(query.brandId ? { brand_id: query.brandId } : {}),
      ...(query.tenantSupplierId
        ? { tenant_supplier_id: query.tenantSupplierId }
        : {}),
    });
  }

  async saveDraft(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchDraftInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    if (input.expected_version === 0) {
      await this.access.assertProjectUpdate(auth, input.project_id);
    } else {
      const batch = await this.requireUpdateBatch(auth, scope, batchId);
      if (batch.project_id !== input.project_id) {
        await this.access.assertProjectUpdate(auth, input.project_id);
      }
    }
    return this.repository.saveDraft({
      ...this.commandContext(scope, batchId, input, idempotencyKey),
      project_id: input.project_id,
      reason: input.reason,
      expected_delivery_date: input.expected_delivery_date ?? null,
      remark: input.remark ?? null,
      items: input.items,
    });
  }

  async submit(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchSubmitInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    await this.requireUpdateBatch(auth, scope, batchId);
    return this.repository.submit(
      this.commandContext(scope, batchId, input, idempotencyKey),
    );
  }

  async cancel(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchCancelInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    await this.requireUpdateBatch(auth, scope, batchId);
    return this.repository.cancel({
      ...this.commandContext(scope, batchId, input, idempotencyKey),
      reason: input.reason,
    });
  }

  async review(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchReviewInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireApprove(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const batch = await this.requireBatchInScope(
      scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    await this.access.assertProjectRead(auth, batch.project_id);
    this.assertReviewBoundary(batch, scope, input.expected_version);

    const canOverrideBudget = input.action === "approve" &&
      batch.budget_status === "over_budget";
    if (canOverrideBudget) {
      this.access.requireFinanceBudgetManage(auth);
    }
    const result = await this.repository.review({
      ...this.commandContext(scope, batchId, input, idempotencyKey),
      action: input.action,
      remark: input.remark ?? null,
      can_override_budget: canOverrideBudget,
    });
    if (result.status === "revision_required") {
      this.throwRevisionRequired(result);
    }
    return result;
  }

  private async listChild(
    auth: AuthContext,
    batchId: string,
    query: { page: number; pageSize: number },
    method: "listItems" | "listRequisitions" | "listOrders",
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    await this.requireBatchInScope(
      scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    return this.repository[method]({
      tenant_id: scope.tenantId,
      batch_id: batchId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  private async requireUpdateBatch(
    auth: AuthContext,
    scope: ActorScope,
    batchId: string,
  ) {
    const visibleProjectIds = await this.access
      .getVisibleProjectUpdateIds(auth);
    const batch = await this.requireBatchInScope(
      scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    await this.access.assertProjectUpdate(auth, batch.project_id);
    return batch;
  }

  private async requireBatchInScope(
    tenantId: string,
    batchId: string,
    visibleProjectIds: string[] | null,
  ) {
    const batch = await this.repository.findBatch(tenantId, batchId);
    if (batch && projectIsVisible(batch.project_id, visibleProjectIds)) {
      return batch;
    }
    throw Errors.business(
      404,
      "供应商采购批次不存在",
      "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
    );
  }

  private assertReviewBoundary(
    batch: {
      status: string;
      version: number;
      created_by_employee_id: string;
    },
    scope: ActorScope,
    expectedVersion: number,
  ): void {
    if (batch.status === "pending_approval" &&
      batch.version !== expectedVersion) {
      throw Errors.business(
        409,
        "采购批次版本已变化，请刷新后重试",
        "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT",
      );
    }
    if (batch.created_by_employee_id === scope.employeeId) {
      throw Errors.business(
        409,
        "提交人不能审批自己提交的采购批次",
        "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
      );
    }
  }

  private throwRevisionRequired(
    result: Extract<
      SupplierPurchaseBatchCommandResult,
      { status: "revision_required" }
    >,
  ): never {
    throw Errors.business(
      409,
      "采购批次数据已变化，请刷新并修订后重新提交",
      result.error_code,
      {
        batch: result.batch,
        version: result.version,
        error_code: result.error_code,
        details: result.details,
      },
    );
  }

  private commandContext(
    scope: ActorScope,
    batchId: string,
    input: { expected_version: number },
    idempotencyKey: string,
  ) {
    return {
      tenant_id: scope.tenantId,
      batch_id: batchId,
      expected_version: input.expected_version,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    };
  }
}

function projectIsVisible(
  projectId: string,
  visibleProjectIds: string[] | null,
): boolean {
  return visibleProjectIds === null || visibleProjectIds.includes(projectId);
}

export const supplierPurchaseBatchesService =
  new SupplierPurchaseBatchesService();
