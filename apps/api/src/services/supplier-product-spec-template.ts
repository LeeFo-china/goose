import {
  supplierCatalogRepository,
  type CatalogVisibility,
  type SupplierCatalogRepositoryPort,
} from "@/repositories/supplier-catalog";
import { validateSupplierSkuSpecValues } from "./supplier-product-spec-values";

export type SpecTemplateRepositoryPort = Pick<
  SupplierCatalogRepositoryPort,
  "listSpecDefinitions"
>;

export async function validateSkuSpecsAgainstCurrentTemplate(
  categoryId: string,
  values: Record<string, string | number | boolean | string[]>,
  visibility: CatalogVisibility,
  repository: SpecTemplateRepositoryPort = supplierCatalogRepository,
): Promise<void> {
  const definitions = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await repository.listSpecDefinitions(
      categoryId,
      { page, pageSize: 100, status: "active" },
      visibility,
    );
    definitions.push(...result.list);
    totalPages = result.pagination.totalPages;
    page += 1;
  }

  validateSupplierSkuSpecValues(values, definitions);
}
