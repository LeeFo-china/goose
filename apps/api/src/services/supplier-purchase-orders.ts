import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseOrdersRepository,
  type SupplierPurchaseOrderWithReferences,
} from "@/repositories/supplier-purchase-orders";
import type {
  SupplierPurchaseOrderCancelInput,
  SupplierPurchaseOrderCatalogQuery,
  SupplierPurchaseOrderDraftInput,
  SupplierPurchaseOrderItemListQuery,
  SupplierPurchaseOrderListQuery,
  SupplierPurchaseOrderOptionQuery,
  SupplierPurchaseOrderSubmitInput,
} from "@/schema/supplier-purchase-orders";
import type { AuthContext } from "@/services/authorization";
import {
  supplierPurchaseOrderAccessService,
} from "@/services/supplier-purchase-order-access";
import { tenantSuppliersService } from "@/services/tenant-suppliers";

type PurchaseOrderAccessPort = Pick<
  typeof supplierPurchaseOrderAccessService,
  | "requireRead"
  | "requireManage"
  | "getVisibleProjectIds"
  | "assertProjectRead"
  | "assertProjectUpdate"
>;
type PurchaseOrderRepositoryPort = Pick<
  typeof supplierPurchaseOrdersRepository,
  | "listOrders"
  | "findOrder"
  | "listItems"
  | "listCatalog"
  | "listProjectOptions"
  | "listSupplierOptions"
  | "getFinancialSummary"
  | "saveDraft"
  | "submit"
  | "cancel"
>;
type TenantSupplierEligibilityPort = Pick<
  typeof tenantSuppliersService,
  "assertCanCreatePurchaseOrderForTenant"
>;

export type SupplierPurchaseOrdersServiceDependencies = {
  access?: PurchaseOrderAccessPort;
  repository?: PurchaseOrderRepositoryPort;
  tenantSuppliers?: TenantSupplierEligibilityPort;
  nowFactory?: () => Date;
};

export class SupplierPurchaseOrdersService {
  private readonly access: PurchaseOrderAccessPort;
  private readonly repository: PurchaseOrderRepositoryPort;
  private readonly tenantSuppliers: TenantSupplierEligibilityPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: SupplierPurchaseOrdersServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierPurchaseOrderAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseOrdersRepository;
    this.tenantSuppliers = dependencies.tenantSuppliers ??
      tenantSuppliersService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listOrders(
    auth: AuthContext,
    query: SupplierPurchaseOrderListQuery,
  ) {
    const scope = await this.access.requireRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listOrders({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { project_id: query.projectId } : {}),
      ...(query.tenantSupplierId
        ? { tenant_supplier_id: query.tenantSupplierId }
        : {}),
    });
  }

  async getOrder(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireRead(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectRead(auth, order.project_id);
    return order;
  }

  async listItems(
    auth: AuthContext,
    orderId: string,
    query: SupplierPurchaseOrderItemListQuery,
  ) {
    const scope = await this.access.requireRead(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectRead(auth, order.project_id);
    return this.repository.listItems({
      tenant_id: scope.tenantId,
      order_id: orderId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async listCatalog(
    auth: AuthContext,
    query: SupplierPurchaseOrderCatalogQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    return this.repository.listCatalog({
      tenant_id: scope.tenantId,
      tenant_supplier_id: query.tenantSupplierId,
      priced_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listProjectOptions(
    auth: AuthContext,
    query: SupplierPurchaseOrderOptionQuery,
  ) {
    const scope = await this.access.requireRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listProjectOptions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async listSupplierOptions(
    auth: AuthContext,
    query: SupplierPurchaseOrderOptionQuery,
  ) {
    const scope = await this.access.requireRead(auth);
    return this.repository.listSupplierOptions({
      tenant_id: scope.tenantId,
      checked_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  async getFinancialSummary(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireRead(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectRead(auth, order.project_id);
    return this.repository.getFinancialSummary(scope.tenantId, orderId);
  }

  async saveDraft(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderDraftInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    if (input.expected_version > 0) {
      const order = await this.requireOrder(scope.tenantId, orderId);
      await this.access.assertProjectUpdate(auth, order.project_id);
      this.assertDraftScopeUnchanged(order, input);
    } else {
      await this.access.assertProjectUpdate(auth, input.project_id);
    }
    await this.tenantSuppliers.assertCanCreatePurchaseOrderForTenant(
      scope.tenantId,
      input.tenant_supplier_id,
    );
    return this.repository.saveDraft({
      tenant_id: scope.tenantId,
      order_id: orderId,
      project_id: input.project_id,
      tenant_supplier_id: input.tenant_supplier_id,
      expected_version: input.expected_version,
      expected_delivery_date: input.expected_delivery_date ?? null,
      remark: input.remark ?? null,
      items: input.items,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async submit(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderSubmitInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectUpdate(auth, order.project_id);
    await this.tenantSuppliers.assertCanCreatePurchaseOrderForTenant(
      scope.tenantId,
      order.tenant_supplier_id,
    );
    return this.repository.submit({
      tenant_id: scope.tenantId,
      order_id: orderId,
      expected_version: input.expected_version,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async cancel(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderCancelInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requireManage(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectUpdate(auth, order.project_id);
    return this.repository.cancel({
      tenant_id: scope.tenantId,
      order_id: orderId,
      expected_version: input.expected_version,
      reason: input.reason,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  private async requireOrder(tenantId: string, orderId: string) {
    const order = await this.repository.findOrder(tenantId, orderId);
    if (order) return order;
    throw Errors.business(
      404,
      "供应商采购单不存在",
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    );
  }

  private assertDraftScopeUnchanged(
    order: SupplierPurchaseOrderWithReferences,
    input: Pick<
      SupplierPurchaseOrderDraftInput,
      "project_id" | "tenant_supplier_id"
    >,
  ) {
    if (
      order.project_id === input.project_id &&
      order.tenant_supplier_id === input.tenant_supplier_id
    ) {
      return;
    }
    throw Errors.business(
      409,
      "采购单不允许变更所属项目或供应商关系",
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    );
  }
}

export const supplierPurchaseOrdersService =
  new SupplierPurchaseOrdersService();
