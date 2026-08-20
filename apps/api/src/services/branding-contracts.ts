export const CUSTOM_SUPPORT_BRANDING = "custom_support_branding" as const;
export const PLATFORM_FALLBACK_DISPLAY_NAME = "好店智装云";

export type EntitlementStatus =
  | "active"
  | "suspended"
  | "expired"
  | "revoked";

export type EntitlementSourceType = "manual_grant" | "purchase";

export interface TenantEntitlementRecord {
  id: string;
  tenant_id: string;
  entitlement_code: string;
  status: EntitlementStatus;
  starts_at: string;
  expires_at: string;
  source_type: EntitlementSourceType;
  source_id: string | null;
  suspended_at: string | null;
  suspend_reason: string | null;
  version: number;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SerializedEntitlement {
  id: string;
  tenant_id: string;
  code: string;
  status: EntitlementStatus;
  starts_at: string;
  expires_at: string;
  source_type: EntitlementSourceType;
  source_id: string | null;
  suspended_at: string | null;
  suspend_reason: string | null;
  version: number;
  updated_at: string;
}

export interface TenantBrandingEntitlementSummary {
  code: string;
  status: EntitlementStatus;
  expires_at: string;
  version: number;
}

export type BrandProfileScope = "platform" | "tenant";
export type BrandProfileStatus = "draft" | "published" | "disabled";

export interface BrandProfileRecord {
  id: string;
  scope: BrandProfileScope;
  tenant_id: string | null;
  display_name: string;
  logo_file_id: string;
  published_display_name: string | null;
  published_logo_file_id: string | null;
  status: BrandProfileStatus;
  version: number;
  published_version: number | null;
  published_at: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SerializedBrandProfile {
  display_name: string;
  logo_file_id: string;
  logo_url: string | null;
  status: BrandProfileStatus;
  version: number;
  published_version: number | null;
  has_unpublished_changes: boolean;
  published_at: string | null;
  updated_at: string;
}

type EntitlementActivityRecord = Pick<
  TenantEntitlementRecord,
  "status" | "starts_at" | "expires_at"
>;

export function buildSupportText(displayName: string): string {
  return displayName;
}

export function isEntitlementActive(
  entitlement: EntitlementActivityRecord,
  tenantStatus: string | null | undefined,
  now = new Date(),
): boolean {
  if (tenantStatus !== "active" || entitlement.status !== "active") {
    return false;
  }

  const nowTime = now.getTime();
  const startsAt = new Date(entitlement.starts_at).getTime();
  const expiresAt = new Date(entitlement.expires_at).getTime();
  return startsAt <= nowTime && expiresAt > nowTime;
}

export function serializeEntitlement(
  entitlement: TenantEntitlementRecord,
): SerializedEntitlement {
  return {
    id: entitlement.id,
    tenant_id: entitlement.tenant_id,
    code: entitlement.entitlement_code,
    status: entitlement.status,
    starts_at: entitlement.starts_at,
    expires_at: entitlement.expires_at,
    source_type: entitlement.source_type,
    source_id: entitlement.source_id,
    suspended_at: entitlement.suspended_at,
    suspend_reason: entitlement.suspend_reason,
    version: entitlement.version,
    updated_at: entitlement.updated_at,
  };
}

export function serializeTenantBrandingEntitlementSummary(
  entitlement: SerializedEntitlement | null,
): TenantBrandingEntitlementSummary | null {
  if (!entitlement) return null;
  return {
    code: entitlement.code,
    status: entitlement.status,
    expires_at: entitlement.expires_at,
    version: entitlement.version,
  };
}

export function serializeBrandProfile(
  profile: BrandProfileRecord | null,
  logoUrl: string | null,
): SerializedBrandProfile | null {
  if (profile === null) {
    return null;
  }

  return {
    display_name: profile.display_name,
    logo_file_id: profile.logo_file_id,
    logo_url: logoUrl,
    status: profile.status,
    version: profile.version,
    published_version: profile.published_version,
    has_unpublished_changes: profile.version !== profile.published_version,
    published_at: profile.published_at,
    updated_at: profile.updated_at,
  };
}
