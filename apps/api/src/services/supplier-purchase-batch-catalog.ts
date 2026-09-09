import { supplierPurchaseBatchCatalogRepository } from
  "@/repositories/supplier-purchase-batch-catalog";
import type { SupplierPurchaseBatchCategoryOptionQuery } from
  "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";
import { supplierPurchaseBatchAccessService } from
  "@/services/supplier-purchase-batch-access";

type AccessPort = Pick<typeof supplierPurchaseBatchAccessService, "requireManage">;
type CatalogRepositoryPort = Pick<
  typeof supplierPurchaseBatchCatalogRepository,
  "listCategoryOptions"
>;

export type SupplierPurchaseBatchCatalogServiceDependencies = {
  access?: AccessPort;
  repository?: CatalogRepositoryPort;
  nowFactory?: () => Date;
};

export class SupplierPurchaseBatchCatalogService {
  private readonly access: AccessPort;
  private readonly repository: CatalogRepositoryPort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: SupplierPurchaseBatchCatalogServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierPurchaseBatchAccessService;
    this.repository = dependencies.repository ??
      supplierPurchaseBatchCatalogRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listCategoryOptions(
    auth: AuthContext,
    query: SupplierPurchaseBatchCategoryOptionQuery,
  ) {
    const scope = await this.access.requireManage(auth);
    return this.repository.listCategoryOptions({
      tenant_id: scope.tenantId,
      priced_at: this.nowFactory().toISOString(),
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    });
  }
}

export const supplierPurchaseBatchCatalogService =
  new SupplierPurchaseBatchCatalogService();
