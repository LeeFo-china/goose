import { Errors } from "@/errors/error-factory";
import { supplierPurchaseBatchWorkflowRepository } from "@/repositories/supplier-purchase-batch-workflow";
import { supplierPurchaseBatchesRepository } from
  "@/repositories/supplier-purchase-batches";
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
  SupplierPurchaseBatchWithdrawInput,
} from "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";
import {
  deriveSupplierPurchaseBatchActions,
  supplierPurchaseBatchAccessService,
} from "@/services/supplier-purchase-batch-access";
import { resolveSupplierPurchaseBatchProjectOptionWindow } from
  "@/services/supplier-purchase-batch-project-option-window";
import {
  assertLegacySupplierPurchaseBatchReviewSelf,
  assertSupplierPurchaseBatchReviewVersion,
  executeSupplierPurchaseBatchReview,
} from
  "@/services/supplier-purchase-batch-review";
import { supplierPurchaseBatchWorkflowRuntime } from
  "@/services/supplier-purchase-batch-workflow-runtime";
import { workflowTaskSupplierPurchaseBatchBridge } from
  "@/services/workflow-task-supplier-purchase-batch-bridge";
import {
  SupplierPurchaseBatchWorkflowProjectionService,
  supplierPurchaseBatchWorkflowProjectionService,
  type SupplierPurchaseBatchWorkflowProjectionDependencies,
} from "@/services/supplier-purchase-batch-workflow-projection";

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
type BatchWorkflowRuntimePort = Pick<typeof supplierPurchaseBatchWorkflowRuntime,
  "isEnabled" | "submit">;
type BatchWorkflowRepositoryPort = Pick<
  typeof supplierPurchaseBatchWorkflowRepository, "withdraw">;
type BatchWorkflowReviewBridgePort = Pick<
  typeof workflowTaskSupplierPurchaseBatchBridge,
  "completeLegacyReview"
>;

export type SupplierPurchaseBatchesServiceDependencies = {
  access?: BatchAccessPort;
  repository?: BatchRepositoryPort;
  workflowRuntime?: BatchWorkflowRuntimePort;
  workflowRepository?: BatchWorkflowRepositoryPort;
  workflowReviewBridge?: BatchWorkflowReviewBridgePort;
  workflowProjection?: Pick<
    SupplierPurchaseBatchWorkflowProjectionService,
    "enrichPage" | "enrichDetail"
  >;
  workflowRead?: SupplierPurchaseBatchWorkflowProjectionDependencies["workflowRead"];
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
  private readonly workflowRuntime: BatchWorkflowRuntimePort;
  private readonly workflowRepository: BatchWorkflowRepositoryPort;
  private readonly workflowReviewBridge: BatchWorkflowReviewBridgePort;
  private readonly workflowProjection: Pick<
    SupplierPurchaseBatchWorkflowProjectionService,
    "enrichPage" | "enrichDetail"
  >;
  private readonly nowFactory: () => Date;

  constructor(dependencies: SupplierPurchaseBatchesServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierPurchaseBatchAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseBatchesRepository;
    this.workflowRuntime = dependencies.workflowRuntime ??
      supplierPurchaseBatchWorkflowRuntime;
    this.workflowRepository = dependencies.workflowRepository ??
      supplierPurchaseBatchWorkflowRepository;
    this.workflowReviewBridge = dependencies.workflowReviewBridge ??
      workflowTaskSupplierPurchaseBatchBridge;
    this.workflowProjection = dependencies.workflowProjection ??
      (dependencies.workflowRead
        ? new SupplierPurchaseBatchWorkflowProjectionService({
          workflowRead: dependencies.workflowRead,
        })
        : supplierPurchaseBatchWorkflowProjectionService);
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listBatches(
    auth: AuthContext,
    query: SupplierPurchaseBatchListQuery,
  ) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const page = await this.repository.listBatches({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
    });
    if (!await this.workflowRuntime.isEnabled(scope.tenantId)) return page;
    const updateProjectIds = auth.permissions.some(({ code }) =>
        code === "project.update"
      )
      ? await this.access.getVisibleProjectUpdateIds(auth)
      : [];
    return this.workflowProjection.enrichPage({
      auth,
      scope,
      page,
      updateProjectIds,
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
    const workflowEnabled = await this.workflowRuntime.isEnabled(
      scope.tenantId,
    );
    if (workflowEnabled) {
      return this.workflowProjection.enrichDetail({
        auth,
        scope,
        batch,
        updateProjectIds,
      });
    }
    return {
      ...batch,
      actions: deriveSupplierPurchaseBatchActions({
        status: batch.status,
        createdByEmployeeId: batch.created_by_employee_id,
        submittedByEmployeeId: batch.submitted_by_employee_id,
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
    const updatedAtRange = query.updatedWindow
      ? resolveSupplierPurchaseBatchProjectOptionWindow(
        query.updatedWindow,
        this.nowFactory(),
      )
      : {};
    return this.repository.listProjectOptions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...updatedAtRange,
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
      if (batch.status === "rejected" &&
        batch.submitted_by_employee_id !== scope.employeeId) {
        throw Errors.forbidden();
      }
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
    const command = this.commandContext(scope, batchId, input, idempotencyKey);
    if (await this.workflowRuntime.isEnabled(scope.tenantId)) {
      return this.workflowRuntime.submit(command);
    }
    return this.repository.submit(command);
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

  async withdraw(auth: AuthContext, batchId: string,
    input: SupplierPurchaseBatchWithdrawInput, idempotencyKey: string) {
    const scope = await this.access.requireManage(auth);
    const batch = await this.requireUpdateBatch(auth, scope, batchId);
    if (batch.submitted_by_employee_id !== scope.employeeId) {
      throw Errors.forbidden();
    }
    return this.workflowRepository.withdraw({
      tenantId: scope.tenantId, batchId,
      expectedVersion: input.expected_version,
      reason: input.reason ?? null,
      actorUserId: scope.authUserId, actorEmployeeId: scope.employeeId,
      idempotencyKey,
    });
  }

  async review(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchReviewInput,
    idempotencyKey: string,
  ) {
    const viewScope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const batch = await this.requireBatchInScope(
      viewScope.tenantId,
      batchId,
      visibleProjectIds,
    );
    await this.access.assertProjectRead(auth, batch.project_id);
    assertSupplierPurchaseBatchReviewVersion(batch, input.expected_version);

    if (await this.workflowRuntime.isEnabled(viewScope.tenantId)) {
      return this.executeReview({
        auth, scope: viewScope, batch, input, idempotencyKey,
        workflowEnabled: true,
      });
    }

    const approveScope = await this.access.requireApprove(auth);
    assertLegacySupplierPurchaseBatchReviewSelf(
      batch,
      approveScope.employeeId,
    );
    return this.executeReview({
      auth, scope: approveScope, batch, input, idempotencyKey,
      workflowEnabled: false,
    });
  }

  private executeReview(input: {
    auth: AuthContext;
    scope: ActorScope;
    batch: Awaited<ReturnType<BatchRepositoryPort["findBatch"]>> & {};
    input: SupplierPurchaseBatchReviewInput;
    idempotencyKey: string;
    workflowEnabled: boolean;
  }) {
    return executeSupplierPurchaseBatchReview({
      auth: input.auth, batch: input.batch, review: input.input,
      idempotencyKey: input.idempotencyKey,
      workflowEnabled: input.workflowEnabled,
      tenantId: input.scope.tenantId, authUserId: input.scope.authUserId,
      employeeId: input.scope.employeeId,
      dependencies: {
        financeAccess: this.access,
        workflowBridge: this.workflowReviewBridge,
        repository: this.repository,
      },
    });
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
      visible_project_ids: visibleProjectIds,
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
    if (visibleProjectIds?.length === 0) {
      throw supplierPurchaseBatchNotFound();
    }
    const batch = await this.repository.findBatch(tenantId, batchId);
    if (batch && projectIsVisible(batch.project_id, visibleProjectIds)) {
      return batch;
    }
    throw supplierPurchaseBatchNotFound();
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

function supplierPurchaseBatchNotFound() {
  return Errors.business(
    404,
    "供应商采购批次不存在",
    "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
  );
}
export const supplierPurchaseBatchesService = new SupplierPurchaseBatchesService();
