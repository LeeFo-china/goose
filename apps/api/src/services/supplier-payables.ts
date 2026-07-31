import {
  supplierPayablesRepository,
} from "@/repositories/supplier-payables";
import type {
  SupplierPayableBatchQuery,
  SupplierPayableFilterOptionQuery,
  SupplierPayableListQuery,
} from "@/schema/supplier-payments";
import type { AuthContext } from "@/services/authorization";
import {
  supplierPaymentAccessService,
} from "@/services/supplier-payment-access";

type AccessPort = Pick<
  typeof supplierPaymentAccessService,
  "requirePayableRead" | "getVisibleProjectIds"
>;
type RepositoryPort = Pick<
  typeof supplierPayablesRepository,
  "list" | "batch" | "listFilterOptions" | "getPurchaseOrderSummary"
>;

export type SupplierPayablesServiceDependencies = {
  access?: AccessPort;
  repository?: RepositoryPort;
};

export class SupplierPayablesService {
  private readonly access: AccessPort;
  private readonly repository: RepositoryPort;

  constructor(dependencies: SupplierPayablesServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierPaymentAccessService;
    this.repository = dependencies.repository ?? supplierPayablesRepository;
  }

  async list(auth: AuthContext, query: SupplierPayableListQuery) {
    const scope = await this.access.requirePayableRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.list({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      ...query,
    });
  }

  async batch(auth: AuthContext, query: SupplierPayableBatchQuery) {
    const scope = await this.access.requirePayableRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.batch({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      ids: query.ids,
    });
  }

  async listFilterOptions(
    auth: AuthContext,
    query: SupplierPayableFilterOptionQuery,
  ) {
    const scope = await this.access.requirePayableRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.listFilterOptions({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      ...query,
    });
  }
}

export const supplierPayablesService = new SupplierPayablesService();
