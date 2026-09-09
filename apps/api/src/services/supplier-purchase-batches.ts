import { Errors } from "@/errors/error-factory";
import { assertProcurementDestinationAccess, assertWarehouseProcurementEnabled, assertWarehouseProcurementPermission, canReadWarehouseProcurement, procurementDestinationRepository, type ProcurementDestinationPort } from "./procurement-destination-access";
import { supplierPurchaseBatchWorkflowRepository } from "@/repositories/supplier-purchase-batch-workflow";
import { supplierPurchaseBatchesRepository } from "@/repositories/supplier-purchase-batches";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { SupplierPurchaseBatchCancelInput, SupplierPurchaseBatchCatalogQuery, SupplierPurchaseBatchCategoryOptionQuery, SupplierPurchaseBatchCostCategoryQuery, SupplierPurchaseBatchDraftInput, SupplierPurchaseBatchItemListQuery, SupplierPurchaseBatchListQuery, SupplierPurchaseBatchOrderListQuery, SupplierPurchaseBatchProjectOptionQuery, SupplierPurchaseBatchRequisitionListQuery, SupplierPurchaseBatchReviewInput, SupplierPurchaseBatchSubmitInput, SupplierPurchaseBatchWithdrawInput } from "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";
import {
  deriveSupplierPurchaseBatchActions,
  supplierPurchaseBatchAccessService,
} from "@/services/supplier-purchase-batch-access";
import { supplierPurchaseBatchCatalogService } from "@/services/supplier-purchase-batch-catalog";
import { resolveSupplierPurchaseBatchDraftCostCategories } from "@/services/supplier-purchase-batch-cost-category-resolution";
import { resolveSupplierPurchaseBatchProjectOptionWindow } from "@/services/supplier-purchase-batch-project-option-window";
import { assertLegacySupplierPurchaseBatchReviewSelf, assertSupplierPurchaseBatchReviewVersion, adaptWorkflowReviewResult, executeSupplierPurchaseBatchReview } from
  "@/services/supplier-purchase-batch-review";
import { supplierPurchaseBatchWorkflowRuntime } from "@/services/supplier-purchase-batch-workflow-runtime";
import { workflowTaskSupplierPurchaseBatchBridge } from "@/services/workflow-task-supplier-purchase-batch-bridge";
import { SupplierPurchaseBatchWorkflowProjectionService, supplierPurchaseBatchWorkflowProjectionService, type SupplierPurchaseBatchWorkflowProjectionDependencies } from "@/services/supplier-purchase-batch-workflow-projection";
import { attachSupplierPurchaseBatchPagePersonnel, attachSupplierPurchaseBatchPersonnel, attachSupplierPurchaseOrderPagePersonnel, loadSupplierPurchaseBatchCurrentApprovers } from "@/services/supplier-purchase-personnel-projection";
type BatchAccessPort = Pick<typeof supplierPurchaseBatchAccessService,
  "requireActorScope" | "requireView" | "requireManage" | "requireApprove" |
  "requireFinanceBudgetManage" | "getVisibleProjectIds" |
  "getVisibleProjectUpdateIds" | "assertProjectRead" | "assertProjectUpdate">;
type BatchRepositoryPort = Pick<typeof supplierPurchaseBatchesRepository,
  "listBatches" | "findBatch" | "listItems" | "listRequisitions" |
  "listOrders" | "listProjectOptions" | "listCostCategories" | "listCatalog" |
  "resolveCostCategoryDefaults" | "saveDraft" | "submit" | "review" | "cancel">;
type BatchWorkflowRuntimePort = Pick<typeof supplierPurchaseBatchWorkflowRuntime, "isEnabled" | "submit">;
type BatchWorkflowRepositoryPort = Pick<
  typeof supplierPurchaseBatchWorkflowRepository, "withdraw">;
type BatchWorkflowReviewBridgePort = Pick<
  typeof workflowTaskSupplierPurchaseBatchBridge,
  "completeLegacyReview" | "replayExactLegacyReview"
>;
type BatchWorkflowTaskReadPort = Pick<
  typeof workflowTaskRepository,
  "listPendingBySubjectIds"
>;
export type SupplierPurchaseBatchesServiceDependencies = {
  destination?: ProcurementDestinationPort;
  access?: BatchAccessPort;
  repository?: BatchRepositoryPort;
  workflowRuntime?: BatchWorkflowRuntimePort;
  workflowRepository?: BatchWorkflowRepositoryPort;
  workflowReviewBridge?: BatchWorkflowReviewBridgePort;
  workflowProjection?: Pick<
    SupplierPurchaseBatchWorkflowProjectionService,
    "enrichPage" | "enrichDetail"
  >;
  workflowTasks?: BatchWorkflowTaskReadPort;
  workflowRead?: SupplierPurchaseBatchWorkflowProjectionDependencies["workflowRead"];
  nowFactory?: () => Date;
};

type ActorScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};
export class SupplierPurchaseBatchesService {
  private readonly destination: ProcurementDestinationPort;
  private readonly access: BatchAccessPort;
  private readonly repository: BatchRepositoryPort;
  private readonly workflowRuntime: BatchWorkflowRuntimePort;
  private readonly workflowRepository: BatchWorkflowRepositoryPort;
  private readonly workflowReviewBridge: BatchWorkflowReviewBridgePort;
  private readonly workflowProjection: Pick<
    SupplierPurchaseBatchWorkflowProjectionService,
    "enrichPage" | "enrichDetail"
  >;
  private readonly workflowTasks: BatchWorkflowTaskReadPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: SupplierPurchaseBatchesServiceDependencies = {}) {
    this.destination = dependencies.destination ?? procurementDestinationRepository;
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
    this.workflowTasks = dependencies.workflowTasks ?? workflowTaskRepository;
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
      ...(canReadWarehouseProcurement(auth) ? { include_warehouse: true } : {}),
      ...(query.destinationType ? { destination_type: query.destinationType } : {}),
      ...(query.warehouseId ? { warehouse_id: query.warehouseId } : {}),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
    });
    const workflowEnabled = await this.workflowRuntime.isEnabled(scope.tenantId);
    if (!workflowEnabled) return attachSupplierPurchaseBatchPagePersonnel(page);
    const updateProjectIds = auth.permissions.some(({ code }) =>
        code === "project.update"
      )
      ? await this.access.getVisibleProjectUpdateIds(auth)
      : [];
    const projected = await this.workflowProjection.enrichPage({
      auth,
      scope,
      page,
      updateProjectIds,
    });
    return attachSupplierPurchaseBatchPagePersonnel(
      projected,
      await loadSupplierPurchaseBatchCurrentApprovers({
        tenantId: scope.tenantId,
        batchIds: projected.list.map(({ id }) => id),
        workflowTasks: this.workflowTasks,
      }),
    );
  }

  async getBatch(auth: AuthContext, batchId: string) {
    const scope = await this.access.requireView(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const batch = await this.requireBatchInScope(
      auth, scope.tenantId,
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
      const projected = await this.workflowProjection.enrichDetail({
        auth,
        scope,
        batch,
        updateProjectIds,
      });
      return attachSupplierPurchaseBatchPersonnel(
        projected,
        (await loadSupplierPurchaseBatchCurrentApprovers({
          tenantId: scope.tenantId,
          batchIds: [projected.id],
          workflowTasks: this.workflowTasks,
        }))
          .get(projected.id) ?? [],
      );
    }
    return {
      ...attachSupplierPurchaseBatchPersonnel(batch),
      actions: deriveSupplierPurchaseBatchActions({
        destinationType: batch.destination_type,
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
    const destination = { destination_type: query.destinationType, project_id: query.projectId ?? null, warehouse_id: query.warehouseId };
    await assertProcurementDestinationAccess(auth, destination, "manage", this.access.assertProjectUpdate.bind(this.access));
    if (destination.destination_type === "warehouse") {
      await assertWarehouseProcurementEnabled(this.destination, scope.tenantId, destination.warehouse_id);
    }
    return this.repository.listCatalog({
      tenant_id: scope.tenantId,
      project_id: query.projectId ?? null,
      ...(query.destinationType === "warehouse" ? { destination_type: "warehouse" as const, warehouse_id: query.warehouseId } : {}),
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

  listCatalogCategories(auth: AuthContext, query: SupplierPurchaseBatchCategoryOptionQuery) { return supplierPurchaseBatchCatalogService.listCategoryOptions(auth, query); }

  async saveDraft(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchDraftInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    if (input.expected_version > 0) {
      const batch = await this.requireUpdateBatch(auth, scope, batchId);
      if (batch.status === "rejected" &&
        batch.submitted_by_employee_id !== scope.employeeId) {
        throw Errors.forbidden();
      }
    }
    await assertProcurementDestinationAccess(auth, input, "manage", this.access.assertProjectUpdate.bind(this.access));
    if (input.destination_type === "warehouse") {
      await assertWarehouseProcurementEnabled(this.destination, scope.tenantId, input.warehouse_id);
    }
    const items = await resolveSupplierPurchaseBatchDraftCostCategories(
      this.repository, scope.tenantId, input.items,
    );
    return this.repository.saveDraft({
      ...this.commandContext(scope, batchId, input, idempotencyKey),
      project_id: input.project_id,
      ...(input.destination_type === "warehouse" ? { destination_type: "warehouse" as const, warehouse_id: input.warehouse_id } : {}),
      reason: input.reason,
      expected_delivery_date: input.expected_delivery_date ?? null,
      remark: input.remark ?? null,
      items,
    });
  }

  async submit(
    auth: AuthContext,
    batchId: string,
    input: SupplierPurchaseBatchSubmitInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const batch = await this.requireUpdateBatch(auth, scope, batchId);
    if (batch.destination_type === "warehouse") {
      await assertWarehouseProcurementEnabled(this.destination, scope.tenantId, batch.warehouse_id);
    }
    const command = this.commandContext(scope, batchId, input, idempotencyKey);
    if (await this.workflowRuntime.isEnabled(scope.tenantId)) {
      return this.workflowRuntime.submit(command);
    }
    if (batch.destination_type === "warehouse") throw Errors.business(409, "仓库采购必须启用审批流程", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_DISABLED");
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
    const actorScope = await this.access.requireActorScope(auth);
    const workflowEnabled = await this.workflowRuntime.isEnabled(
      actorScope.tenantId,
    );
    const scope = workflowEnabled
      ? await this.access.requireView(auth)
      : await this.access.requireApprove(auth);
    if (workflowEnabled) {
      const replay = await this.workflowReviewBridge.replayExactLegacyReview({
        authContext: auth, tenantId: scope.tenantId, batchId,
        action: input.action, reason: input.remark ?? null,
        expectedVersion: input.expected_version, output: {}, idempotencyKey,
      });
      if (replay.matched) return adaptWorkflowReviewResult(replay.result);
    }
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    const batch = await this.requireBatchInScope(
      auth, scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    await assertProcurementDestinationAccess(auth, batch, "read", this.access.assertProjectRead.bind(this.access));
    if (batch.destination_type === "warehouse") assertWarehouseProcurementPermission(auth, "manage");
    if (!workflowEnabled && batch.destination_type === "warehouse") throw Errors.business(409, "仓库采购必须启用审批流程", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_DISABLED");
    assertSupplierPurchaseBatchReviewVersion(batch, input.expected_version);
    if (!workflowEnabled) {
      assertLegacySupplierPurchaseBatchReviewSelf(batch, scope.employeeId);
    }
    return this.executeReview({
      auth, scope, batch, input, idempotencyKey, workflowEnabled,
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
    const batch = await this.requireBatchInScope(
      auth, scope.tenantId,
      batchId,
      visibleProjectIds,
    );
    const page = await this.repository[method]({
      tenant_id: scope.tenantId,
      batch_id: batchId,
      visible_project_ids: batch.destination_type === "warehouse" ? null : visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
    });
    if (method !== "listOrders") return page;
    return attachSupplierPurchaseOrderPagePersonnel({
      ...page,
      list: page.list.map((order) => ({ ...order, purchase_batch: batch })),
    });
  }

  private async requireUpdateBatch(auth: AuthContext, scope: ActorScope, batchId: string) {
    const visibleProjectIds = await this.access
      .getVisibleProjectUpdateIds(auth);
    const batch = await this.requireBatchInScope(
      auth, scope.tenantId,
      batchId,
      visibleProjectIds,
      "manage",
    );
    await assertProcurementDestinationAccess(auth, batch, "manage", this.access.assertProjectUpdate.bind(this.access));
    return batch;
  }

  private async requireBatchInScope(auth: AuthContext, tenantId: string, batchId: string,
    visibleProjectIds: string[] | null, mode: "read" | "manage" = "read") {
    const canAccessWarehouse = mode === "read" ? canReadWarehouseProcurement(auth)
      : auth.permissions.some(({ code }) => code === "inventory.warehouse.manage");
    if (visibleProjectIds?.length === 0 && !canAccessWarehouse) throw supplierPurchaseBatchNotFound();
    const batch = await this.repository.findBatch(tenantId, batchId);
    if (batch?.destination_type === "warehouse") {
      if (canAccessWarehouse) return batch;
      throw supplierPurchaseBatchNotFound();
    }
    if (batch && projectIsVisible(batch.project_id, visibleProjectIds)) {
      return batch;
    }
    throw supplierPurchaseBatchNotFound();
  }

  private commandContext(scope: ActorScope, batchId: string,
    input: { expected_version: number }, idempotencyKey: string) {
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
  projectId: string | null,
  visibleProjectIds: string[] | null,
): boolean {
  return projectId !== null && (visibleProjectIds === null || visibleProjectIds.includes(projectId));
}

function supplierPurchaseBatchNotFound() {
  return Errors.business(
    404,
    "供应商采购批次不存在",
    "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
  );
}
export const supplierPurchaseBatchesService = new SupplierPurchaseBatchesService();
