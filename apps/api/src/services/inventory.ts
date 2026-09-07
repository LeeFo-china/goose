import {
  inventoryRepository,
  type InventoryRepository,
} from "@/repositories/inventory";
import type {
  InventoryBalanceListQuery,
  InventoryTransactionListQuery,
} from "@/schema/inventory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type RepositoryPort = Pick<
  InventoryRepository,
  "listBalances" | "listTransactions"
>;
type AccessPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;

export type InventoryServiceDependencies = {
  repository?: RepositoryPort;
  access?: AccessPort;
};

export class InventoryService {
  private readonly repository: RepositoryPort;
  private readonly access: AccessPort;

  constructor(dependencies: InventoryServiceDependencies = {}) {
    this.repository = dependencies.repository ?? inventoryRepository;
    this.access = dependencies.access ?? accessPolicyService;
  }

  listBalances(auth: AuthContext, query: InventoryBalanceListQuery) {
    const tenantId = this.requireStockRead(auth);
    return this.repository.listBalances({
      tenant_id: tenantId,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.warehouseId ? { warehouse_id: query.warehouseId } : {}),
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }

  listTransactions(auth: AuthContext, query: InventoryTransactionListQuery) {
    const tenantId = this.requireStockRead(auth);
    return this.repository.listTransactions({
      tenant_id: tenantId,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.warehouseId ? { warehouse_id: query.warehouseId } : {}),
      ...(query.supplierSkuId ? { supplier_sku_id: query.supplierSkuId } : {}),
      ...(query.transactionType
        ? { transaction_type: query.transactionType }
        : {}),
    });
  }

  private requireStockRead(auth: AuthContext): string {
    const tenantId = this.access.assertTenantContext(auth);
    this.access.assertPermission(auth, "inventory.stock.view");
    return tenantId;
  }
}

export const inventoryService = new InventoryService();
