import { z } from "zod";

import {
  SupplierOnboardingStatusSchema,
  SupplierOperationalStatusSchema,
  SupplierQualificationVerificationStatusSchema,
  SupplierRecordStatusSchema,
  SupplierTypeSchema,
} from "@/schema/platform-suppliers";

const nullableString = z.string().nullable();
const auditFields = {
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
};
const childAuditFields = {
  supplier_id: z.uuid(),
  created_by_employee_id: z.uuid(),
  updated_by_employee_id: z.uuid(),
  ...auditFields,
};

export const SupplierCoreSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string(),
  unified_social_credit_code: nullableString,
  supplier_type: SupplierTypeSchema,
  onboarding_status: SupplierOnboardingStatusSchema,
  operational_status: SupplierOperationalStatusSchema,
  ...auditFields,
}).strict();

export const SupplierListRowSchema = SupplierCoreSchema.extend({
  qualification_health: z.enum(["valid", "expiring", "expired", "missing"]),
});

export const SupplierDetailSchema = SupplierCoreSchema.extend({
  legal_representative_name: nullableString,
  registered_address_text: nullableString,
  review_remark: nullableString,
  reviewed_by_employee_id: z.uuid().nullable(),
  reviewed_at: nullableString,
  blacklisted_by_employee_id: z.uuid().nullable(),
  blacklisted_at: nullableString,
  blacklist_reason: nullableString,
  created_by_employee_id: z.uuid(),
  updated_by_employee_id: z.uuid(),
}).strict();

export const QualificationTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  applicable_supplier_types: z.array(SupplierTypeSchema),
  warning_days: z.number().int().nonnegative(),
  is_required: z.boolean(),
  blocks_new_orders: z.boolean(),
  status: SupplierRecordStatusSchema,
  sort_order: z.number().int(),
  ...auditFields,
}).strict();

export const QualificationSchema = z.object({
  id: z.uuid(),
  qualification_type_id: z.uuid(),
  document_file_id: z.uuid(),
  certificate_no: nullableString,
  valid_from: nullableString,
  valid_until: nullableString,
  verification_status: SupplierQualificationVerificationStatusSchema,
  verified_by_employee_id: z.uuid().nullable(),
  verified_at: nullableString,
  rejection_reason: nullableString,
  ...childAuditFields,
}).strict();

export const RegionSchema = z.object({
  id: z.uuid(),
  region_code: z.string(),
  region_level: z.enum(["province", "city", "district"]),
  status: SupplierRecordStatusSchema,
  valid_from: nullableString,
  valid_until: nullableString,
  ...childAuditFields,
}).strict();

const nullableNumber = z.union([z.number(), z.string()])
  .nullable()
  .transform((value) => value === null ? null : Number(value));

export const AddressSchema = z.object({
  id: z.uuid(),
  address_type: z.enum(["registered", "shipping", "return", "other"]),
  province: nullableString,
  city: nullableString,
  district: nullableString,
  region_code: z.string(),
  address_detail: z.string(),
  longitude: nullableNumber,
  latitude: nullableNumber,
  is_default: z.boolean(),
  status: SupplierRecordStatusSchema,
  ...childAuditFields,
}).strict();

export const ContactSchema = z.object({
  id: z.uuid(),
  contact_type: z.enum([
    "primary",
    "sales",
    "finance",
    "logistics",
    "after_sales",
  ]),
  name: z.string(),
  phone: nullableString,
  email: nullableString,
  is_public: z.boolean(),
  is_primary: z.boolean(),
  status: SupplierRecordStatusSchema,
  ...childAuditFields,
}).strict();

export const EventSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid().nullable(),
  resource_type: z.string(),
  resource_id: z.uuid(),
  command: z.string(),
  from_state: z.record(z.string(), z.unknown()),
  to_state: z.record(z.string(), z.unknown()),
  reason: nullableString,
  actor_user_id: z.uuid(),
  actor_employee_id: z.uuid(),
  idempotency_key: z.string(),
  result_version: z.number().int().positive(),
  created_at: z.string(),
}).strict();

export const SettingsSchema = z.object({
  tenant_id: z.uuid(),
  module_enabled: z.boolean(),
  require_active_contract_for_new_order: z.boolean(),
  ownership_reads_enabled: z.boolean(),
  private_supplier_writes_enabled: z.boolean(),
  private_catalog_writes_enabled: z.boolean(),
  procurement_snapshot_v1_enabled: z.boolean(),
  enabled_by_employee_id: z.uuid().nullable(),
  enabled_at: nullableString,
  ...auditFields,
}).strict();

export type PlatformSupplierListItem =
  z.infer<typeof SupplierListRowSchema>;
export type PlatformSupplierDetail = z.infer<typeof SupplierDetailSchema>;
export type SupplierQualificationType = z.infer<typeof QualificationTypeSchema>;
export type SupplierQualification = z.infer<typeof QualificationSchema>;
export type SupplierServiceRegion = z.infer<typeof RegionSchema>;
export type SupplierAddress = z.infer<typeof AddressSchema>;
export type SupplierContact = z.infer<typeof ContactSchema>;
export type SupplierEvent = z.infer<typeof EventSchema>;
export type TenantSupplierSettings = z.infer<typeof SettingsSchema>;
