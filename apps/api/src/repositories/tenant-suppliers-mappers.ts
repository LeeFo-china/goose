import {
  SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES,
  SUPPLIER_ONBOARDING_STATUS_VALUES,
  SUPPLIER_OPERATIONAL_STATUS_VALUES,
  SUPPLIER_ORDER_BLOCKING_REASON_VALUES,
  SUPPLIER_TYPE_VALUES,
  TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export const SUPPLIER_SELECT = [
  "id", "code", "name", "legal_name", "supplier_type",
  "onboarding_status", "operational_status", "version",
].join(",");
export const RELATIONSHIP_FIELDS = [
  "id", "tenant_id", "supplier_id", "relationship_status",
  "settlement_term_days", "credit_limit_minor",
  "invoice_required_before_payment", "default_currency",
  "default_tax_inclusive", "tenant_owner_employee_id",
  "started_at", "ended_at", "remark", "version",
  "created_by_employee_id", "updated_by_employee_id",
  "created_at", "updated_at",
].join(",");
export const RELATIONSHIP_SELECT =
  `${RELATIONSHIP_FIELDS},supplier:suppliers!inner(${SUPPLIER_SELECT})`;
export const SETTINGS_SELECT = [
  "tenant_id", "module_enabled", "require_active_contract_for_new_order",
  "ownership_reads_enabled", "private_supplier_writes_enabled",
  "private_catalog_writes_enabled", "procurement_snapshot_v1_enabled",
  "enabled_by_employee_id", "enabled_at", "version", "created_at", "updated_at",
].join(",");
export const CONTRACT_SELECT = [
  "id", "tenant_id", "tenant_supplier_id", "contract_no", "name",
  "lifecycle_status", "valid_from", "valid_until", "settlement_term_days",
  "invoice_required_before_payment", "document_file_id", "version",
  "created_by_employee_id", "updated_by_employee_id", "created_at", "updated_at",
].join(",");
export const EVENT_SELECT = [
  "id", "tenant_id", "resource_type", "resource_id", "command",
  "from_state", "to_state", "reason", "actor_user_id", "actor_employee_id",
  "idempotency_key", "result_version", "created_at",
].join(",");

const nullableText = z.string().nullable();
const timestamp = z.string();
export const SupplierSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string(),
  supplier_type: z.enum(SUPPLIER_TYPE_VALUES),
  onboarding_status: z.enum(SUPPLIER_ONBOARDING_STATUS_VALUES),
  operational_status: z.enum(SUPPLIER_OPERATIONAL_STATUS_VALUES),
  version: z.number().int().positive(),
}).strict();
export const EligibilitySchema = z.object({
  eligible: z.boolean(),
  blocking_reasons: z.array(z.enum(SUPPLIER_ORDER_BLOCKING_REASON_VALUES)),
  checked_at: timestamp,
  tenant_id: z.uuid(),
  tenant_supplier_id: z.uuid(),
  supplier_id: z.uuid().optional(),
  supplier_version: z.number().int().positive().optional(),
  tenant_supplier_version: z.number().int().positive().optional(),
  error_code: z.string().optional(),
}).strict();
const safeInteger = z.union([
  z.number().int().safe(),
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe()),
]);
export const RelationshipSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  supplier_id: z.uuid(),
  relationship_status: z.enum(TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES),
  settlement_term_days: z.number().int().nonnegative(),
  credit_limit_minor: safeInteger,
  invoice_required_before_payment: z.boolean(),
  default_currency: z.string(),
  default_tax_inclusive: z.boolean(),
  tenant_owner_employee_id: z.uuid().nullable(),
  started_at: nullableText,
  ended_at: nullableText,
  remark: nullableText,
  version: z.number().int().positive(),
  created_by_employee_id: z.uuid(),
  updated_by_employee_id: z.uuid(),
  created_at: timestamp,
  updated_at: timestamp,
  supplier: SupplierSchema,
  eligibility: EligibilitySchema.optional(),
}).strict();
export const SUPPLIER_CONTRACT_HEALTH_VALUES = [
  "valid",
  "expiring",
  "expired",
  "missing",
] as const;
export const RelationshipListItemSchema = RelationshipSchema.extend({
  contract_health: z.enum(SUPPLIER_CONTRACT_HEALTH_VALUES),
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
  enabled_at: nullableText,
  version: z.number().int().positive(),
  created_at: timestamp,
  updated_at: timestamp,
}).strict();
export const ContractSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  tenant_supplier_id: z.uuid(),
  contract_no: z.string(),
  name: z.string(),
  lifecycle_status: z.enum(SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES),
  valid_from: z.string(),
  valid_until: z.string(),
  settlement_term_days: z.number().int().nonnegative(),
  invoice_required_before_payment: z.boolean(),
  document_file_id: z.uuid(),
  version: z.number().int().positive(),
  created_by_employee_id: z.uuid(),
  updated_by_employee_id: z.uuid(),
  created_at: timestamp,
  updated_at: timestamp,
}).strict();
export const EventSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  resource_type: z.string(),
  resource_id: z.uuid(),
  command: z.string(),
  from_state: z.record(z.string(), z.unknown()),
  to_state: z.record(z.string(), z.unknown()),
  reason: nullableText,
  actor_user_id: z.uuid(),
  actor_employee_id: z.uuid(),
  idempotency_key: z.string(),
  result_version: z.number().int().positive(),
  created_at: timestamp,
}).strict();
export const DirectoryEnvelopeSchema = z.object({
  items: z.array(SupplierSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();
export const RelationshipPageEnvelopeSchema = z.object({
  items: z.array(RelationshipListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();
export const MutationEnvelopeSchema = z.object({
  status: z.enum([
    "created", "updated", "supplier_not_found", "tenant_supplier_not_found",
    "state_conflict", "version_conflict", "idempotency_conflict",
  ]),
  idempotent: z.boolean().optional(),
  tenant_supplier: RelationshipSchema.optional(),
  contract: ContractSchema.optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
}).strict();

export type TenantSupplierSettings = z.infer<typeof SettingsSchema>;
export type TenantSupplierDetail = z.infer<typeof RelationshipSchema>;
export type TenantSupplierListItem = z.infer<
  typeof RelationshipListItemSchema
>;
export type SupplierDirectoryItem = z.infer<typeof SupplierSchema>;
export type SupplierContract = z.infer<typeof ContractSchema>;
export type SupplierEvent = z.infer<typeof EventSchema>;
export type SupplierOrderEligibility = z.infer<typeof EligibilitySchema>;
export type TenantSupplierMutationResult = z.infer<typeof MutationEnvelopeSchema>;
export type SupplierContractMutationResult = TenantSupplierMutationResult;
export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export type TenantSupplierPage = Page<TenantSupplierListItem>;
export type SupplierDirectoryPage = Page<SupplierDirectoryItem>;
export type SupplierContractPage = Page<SupplierContract>;
export type SupplierEventPage = Page<SupplierEvent>;

export function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export function normalizePage(input: { page: number; pageSize: number }) {
  return {
    page: Number.isInteger(input.page) && input.page > 0 ? input.page : 1,
    pageSize: Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(input.pageSize, 100)
      : 20,
  };
}

export function toRange(input: { page: number; pageSize: number }) {
  const start = (input.page - 1) * input.pageSize;
  return { start, end: start + input.pageSize - 1 };
}

export function toPage<T>(
  list: T[],
  pagination: { page: number; pageSize: number },
  count: number | null,
): Page<T> {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...pagination,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
    },
  };
}

export function envelopeToPage<T>(envelope: {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}): Page<T> {
  return toPage(
    envelope.items,
    { page: envelope.page, pageSize: envelope.page_size },
    envelope.total,
  );
}

export function sanitizeKeyword(keyword?: string) {
  return keyword?.replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim() || "";
}

export function compact(input: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export function versionConflict() {
  return Errors.business(
    409,
    "数据版本已变化，请刷新后重试",
    "SUPPLIER_VERSION_CONFLICT",
  );
}
