import type {
  SupplierAddress,
  SupplierContact,
  SupplierQualification,
  SupplierQualificationType,
  SupplierServiceRegion,
} from "./platform-supplier-records";
import type { CreateCommandResult } from "./supplier-create-command-rpc";

export type QualificationTypeCreateResult =
  CreateCommandResult<"qualification_type", SupplierQualificationType>;
export type QualificationCreateResult =
  CreateCommandResult<"qualification", SupplierQualification>;
export type ServiceRegionCreateResult =
  CreateCommandResult<"service_region", SupplierServiceRegion>;
export type AddressCreateResult =
  CreateCommandResult<"address", SupplierAddress>;
export type ContactCreateResult =
  CreateCommandResult<"contact", SupplierContact>;
