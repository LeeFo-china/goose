import {
  supplierPayablesRepository,
} from "@/repositories/supplier-payables";
import type { SupplierPayableListQuery } from "@/schema/supplier-payments";
import type { AuthContext } from "@/services/authorization";
import {
  supplierPaymentAccessService,
} from "@/services/supplier-payment-access";

type AccessPort = Pick<
  typeof supplierPaymentAccessService,
  "requirePayableRead" | "assertProjectRead"
>;
type RepositoryPort = Pick<
  typeof supplierPayablesRepository,
  "list" | "getPurchaseOrderSummary"
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
    if (query.project_id) {
      await this.access.assertProjectRead(auth, query.project_id);
    }

    const result = await this.repository.list({
      tenant_id: scope.tenantId,
      ...query,
    });
    const projectIds = new Set(
      result.list.map((item) => item.project_id),
    );
    for (const projectId of projectIds) {
      await this.access.assertProjectRead(auth, projectId);
    }
    return result;
  }
}

export const supplierPayablesService = new SupplierPayablesService();
