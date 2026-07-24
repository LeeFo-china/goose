import type { z } from "zod";

import type {
  SupplierAddressCreateSchema,
  SupplierContactCreateSchema,
  SupplierQualificationCreateSchema,
  SupplierQualificationTypeCreateSchema,
  SupplierServiceRegionCreateSchema,
} from "./platform-suppliers";
import type {
  CatalogBrandCreateSchema,
  CatalogCategoryCreateSchema,
  CatalogUnitCreateSchema,
} from "./supplier-catalog";

export type AtomicCreateContext = {
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

export type SupplierQualificationTypeCreateCommand =
  z.infer<typeof SupplierQualificationTypeCreateSchema> &
  AtomicCreateContext & {
    qualification_type_id: string;
  };

export type SupplierQualificationCreateCommand =
  z.infer<typeof SupplierQualificationCreateSchema> &
  AtomicCreateContext & {
    qualification_id: string;
    supplier_id: string;
  };

export type SupplierServiceRegionCreateCommand =
  z.infer<typeof SupplierServiceRegionCreateSchema> &
  AtomicCreateContext & {
    region_id: string;
    supplier_id: string;
  };

export type SupplierAddressCreateCommand =
  z.infer<typeof SupplierAddressCreateSchema> &
  AtomicCreateContext & {
    address_id: string;
    supplier_id: string;
  };

export type SupplierContactCreateCommand =
  z.infer<typeof SupplierContactCreateSchema> &
  AtomicCreateContext & {
    contact_id: string;
    supplier_id: string;
  };

export type CatalogCategoryCreateCommand =
  z.infer<typeof CatalogCategoryCreateSchema> &
  AtomicCreateContext & {
    category_id: string;
  };

export type CatalogBrandCreateCommand =
  z.infer<typeof CatalogBrandCreateSchema> &
  AtomicCreateContext & {
    brand_id: string;
  };

export type CatalogUnitCreateCommand =
  z.infer<typeof CatalogUnitCreateSchema> &
  AtomicCreateContext & {
    unit_id: string;
  };
