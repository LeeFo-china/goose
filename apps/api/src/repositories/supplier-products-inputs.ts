import type { PageInput } from "@/repositories/supplier-products-model";

export type ProductFilters = PageInput & {
  supplier_id: string;
  keyword?: string;
  status?: string;
  category_id?: string;
  brand_id?: string;
};

export type SupplierProductListInput = ProductFilters & { tenant_id: string };
export type PlatformSupplierProductListInput = ProductFilters;

export type SupplierSkuListInput = PageInput & {
  supplier_id: string;
  tenant_id: string;
  tenant_supplier_id: string;
  supplier_product_id: string;
  keyword?: string;
  status?: string;
};

export type PlatformSupplierSkuListInput = Omit<
  SupplierSkuListInput,
  "tenant_id" | "tenant_supplier_id"
>;

export type OwnershipScope = "platform" | "tenant";

export type CommandActor = {
  tenant_id: string | null;
  tenant_supplier_id: string | null;
  supplier_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

export type SupplierCommandContext = Omit<
  CommandActor,
  "tenant_id" | "tenant_supplier_id"
> & {
  tenant_id: string;
  tenant_supplier_id: string;
};

export type SupplierProductCreateCommand = SupplierCommandContext & {
  product_id: string;
  product_code: string;
  name: string;
  category_id: string;
  brand_id: string;
  description?: string | null;
};
