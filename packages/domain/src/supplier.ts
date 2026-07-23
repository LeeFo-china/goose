export const SUPPLIER_TYPE_VALUES = [
  'manufacturer',
  'brand_agent',
  'distributor',
  'retailer',
  'other',
] as const;

export type SupplierType = (typeof SUPPLIER_TYPE_VALUES)[number];

export const SUPPLIER_ONBOARDING_STATUS_VALUES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
] as const;

export type SupplierOnboardingStatus =
  (typeof SUPPLIER_ONBOARDING_STATUS_VALUES)[number];

export const SUPPLIER_OPERATIONAL_STATUS_VALUES = [
  'active',
  'suspended',
  'blacklisted',
] as const;

export type SupplierOperationalStatus =
  (typeof SUPPLIER_OPERATIONAL_STATUS_VALUES)[number];

export const SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES = [
  'pending',
  'verified',
  'rejected',
] as const;

export type SupplierQualificationVerificationStatus =
  (typeof SUPPLIER_QUALIFICATION_VERIFICATION_STATUS_VALUES)[number];

export const SUPPLIER_QUALIFICATION_HEALTH_VALUES = [
  'valid',
  'expiring',
  'expired',
  'missing',
] as const;

export type SupplierQualificationHealth =
  (typeof SUPPLIER_QUALIFICATION_HEALTH_VALUES)[number];

export const TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES = [
  'evaluating',
  'active',
  'suspended',
  'terminated',
  'blacklisted',
] as const;

export type TenantSupplierRelationshipStatus =
  (typeof TENANT_SUPPLIER_RELATIONSHIP_STATUS_VALUES)[number];

export const SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES = [
  'draft',
  'active',
  'terminated',
] as const;

export type SupplierContractLifecycleStatus =
  (typeof SUPPLIER_CONTRACT_LIFECYCLE_STATUS_VALUES)[number];

export const SUPPLIER_ORDER_BLOCKING_REASON_VALUES = [
  'module_disabled',
  'supplier_not_approved',
  'supplier_suspended',
  'supplier_blacklisted',
  'relationship_not_active',
  'required_qualification_missing',
  'required_qualification_expired',
  'active_contract_required',
] as const;

export type SupplierOrderBlockingReason =
  (typeof SUPPLIER_ORDER_BLOCKING_REASON_VALUES)[number];

export const isSupplierOrderBlockingReason = (
  value: string,
): value is SupplierOrderBlockingReason =>
  SUPPLIER_ORDER_BLOCKING_REASON_VALUES.includes(
    value as SupplierOrderBlockingReason,
  );
