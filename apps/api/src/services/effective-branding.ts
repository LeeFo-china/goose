import {
  brandingRepository,
  type BrandProfileRecord,
} from "@/repositories/branding";
import { authorizationService } from "@/services/authorization";
import { CONTROLLED_FALLBACK_LOGO_URL } from "@/services/branding-default-logo";
import { assertValidBrandLogoFile } from "@/services/branding-file-policy";
import {
  CUSTOM_SUPPORT_BRANDING,
  PLATFORM_FALLBACK_DISPLAY_NAME,
  buildSupportText,
  isEntitlementActive,
} from "@/services/branding-contracts";
import { tenantEntitlementsService } from "@/services/tenant-entitlements";
import type { JwtPayload } from "@/utils/jwt";

const CONTROLLED_FALLBACK_UPDATED_AT = "1970-01-01T00:00:00.000Z";

type BrandingRepositoryPort = Pick<
  typeof brandingRepository,
  | "findPlatformProfile"
  | "findTenantProfile"
  | "findTenant"
  | "findPlatformBrandLogoForBinding"
  | "findTenantBrandLogoForBinding"
>;

type TenantEntitlementsPort = Pick<
  typeof tenantEntitlementsService,
  "getTenantSummary"
>;

type AuthorizationPort = Pick<
  typeof authorizationService,
  "getRequiredAuthContext"
>;

export type EffectiveBranding = {
  source: "platform" | "tenant";
  tenant_id: string | null;
  display_name: string;
  logo_url: string;
  support_text: string;
  version: number;
  updated_at: string;
};

export type EffectiveBrandingServiceDependencies = {
  brandingRepository?: BrandingRepositoryPort;
  tenantEntitlementsService?: TenantEntitlementsPort;
  authorizationService?: AuthorizationPort;
  fallbackLogoUrl?: string | null;
};

export class EffectiveBrandingService {
  private readonly brandingRepository: BrandingRepositoryPort;
  private readonly tenantEntitlementsService: TenantEntitlementsPort;
  private readonly authorizationService: AuthorizationPort;
  private readonly controlledFallback: EffectiveBranding;

  constructor(dependencies: EffectiveBrandingServiceDependencies = {}) {
    this.brandingRepository = dependencies.brandingRepository ??
      brandingRepository;
    this.tenantEntitlementsService = dependencies.tenantEntitlementsService ??
      tenantEntitlementsService;
    this.authorizationService = dependencies.authorizationService ??
      authorizationService;
    const configuredFallback = dependencies.fallbackLogoUrl === undefined
      ? process.env.BRANDING_FALLBACK_LOGO_URL
      : dependencies.fallbackLogoUrl;
    this.controlledFallback = buildBranding({
      source: "platform",
      tenantId: null,
      displayName: PLATFORM_FALLBACK_DISPLAY_NAME,
      logoUrl: validPublicHttpUrl(configuredFallback) ??
        CONTROLLED_FALLBACK_LOGO_URL,
      version: 0,
      updatedAt: CONTROLLED_FALLBACK_UPDATED_AT,
    });
  }

  async resolveForRequest(
    user: JwtPayload | undefined,
    now = new Date(),
  ): Promise<EffectiveBranding> {
    const platform = await this.resolvePlatform(now);
    const authUserId = user?.token_type === "visitor_session"
      ? null
      : normalizedId(user?.sub);
    if (!authUserId) {
      return platform;
    }

    try {
      const context = await this.authorizationService.getRequiredAuthContext(
        authUserId,
        { allowedWhenBillingLocked: true },
      );
      return this.resolveTenantAgainstPlatform(
        normalizedId(context.tenantId),
        now,
        platform,
      );
    } catch {
      return platform;
    }
  }

  async resolveForTenant(
    tenantId: string | null,
    now = new Date(),
  ): Promise<EffectiveBranding> {
    const platform = await this.resolvePlatform(now);
    return this.resolveTenantAgainstPlatform(tenantId, now, platform);
  }

  private async resolveTenantAgainstPlatform(
    tenantId: string | null,
    now: Date,
    platform: EffectiveBranding,
  ): Promise<EffectiveBranding> {
    const normalizedTenantId = normalizedId(tenantId);
    if (!normalizedTenantId) return platform;

    try {
      const tenant = await this.brandingRepository.findTenant(
        normalizedTenantId,
      );
      if (!tenant || tenant.status !== "active") return platform;

      const summary = await this.tenantEntitlementsService.getTenantSummary(
        normalizedTenantId,
        now,
      );
      const validatedSummary = validEntitlementSummary(
        summary,
        normalizedTenantId,
      );
      if (
        !validatedSummary?.isActive ||
        !isEntitlementActive(
          validatedSummary.entitlement,
          tenant.status,
          now,
        )
      ) return platform;

      const profile = await this.brandingRepository.findTenantProfile(
        normalizedTenantId,
      );
      const published = publishedSnapshot(
        profile,
        "tenant",
        normalizedTenantId,
      );
      if (!published) return platform;

      const file =
        await this.brandingRepository.findTenantBrandLogoForBinding(
          published.logoFileId,
          normalizedTenantId,
        );
      const validFile = assertValidBrandLogoFile(
        { tenantId: normalizedTenantId },
        file,
      );
      const logoUrl = validPublicHttpUrl(validFile.public_url);
      if (!logoUrl) return platform;
      return buildBranding({
        source: "tenant",
        tenantId: normalizedTenantId,
        displayName: published.displayName,
        logoUrl,
        version: published.version,
        updatedAt: published.updatedAt,
      });
    } catch {
      return platform;
    }
  }

  async resolvePlatform(_now = new Date()): Promise<EffectiveBranding> {
    try {
      const profile = await this.brandingRepository.findPlatformProfile();
      const published = publishedSnapshot(profile, "platform", null);
      if (!published) return this.controlledFallback;

      const file =
        await this.brandingRepository.findPlatformBrandLogoForBinding(
          published.logoFileId,
        );
      const validFile = assertValidBrandLogoFile({ tenantId: null }, file);
      const logoUrl = validPublicHttpUrl(validFile.public_url);
      if (!logoUrl) return this.controlledFallback;
      return buildBranding({
        source: "platform",
        tenantId: null,
        displayName: published.displayName,
        logoUrl,
        version: published.version,
        updatedAt: published.updatedAt,
      });
    } catch {
      return this.controlledFallback;
    }
  }
}

type PublishedSnapshot = {
  displayName: string;
  logoFileId: string;
  version: number;
  updatedAt: string;
};

function publishedSnapshot(
  profile: BrandProfileRecord | null,
  scope: "platform" | "tenant",
  tenantId: string | null,
): PublishedSnapshot | null {
  const displayName = profile?.published_display_name ?? null;
  const logoFileId = normalizedId(profile?.published_logo_file_id);
  const version = profile?.published_version ?? null;
  if (
    !profile ||
    profile.scope !== scope ||
    profile.tenant_id !== tenantId ||
    profile.status !== "published" ||
    !validDisplayName(displayName) ||
    !logoFileId ||
    !Number.isSafeInteger(version) ||
    version === null ||
    version <= 0 ||
    !Number.isSafeInteger(profile.version) ||
    profile.version < version
  ) return null;

  const publishedAt = normalizedDate(profile.published_at);
  if (!publishedAt) return null;
  return {
    displayName,
    logoFileId,
    version,
    updatedAt: publishedAt,
  };
}

function buildBranding(input: {
  source: "platform" | "tenant";
  tenantId: string | null;
  displayName: string;
  logoUrl: string;
  version: number;
  updatedAt: string;
}): EffectiveBranding {
  return {
    source: input.source,
    tenant_id: input.tenantId,
    display_name: input.displayName,
    logo_url: input.logoUrl,
    support_text: buildSupportText(input.displayName),
    version: input.version,
    updated_at: input.updatedAt,
  };
}

function normalizedId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

type ValidEntitlementSummary = {
  isActive: boolean;
  entitlement: {
    status: "active" | "suspended" | "expired" | "revoked";
    starts_at: string;
    expires_at: string;
  };
};

function validEntitlementSummary(
  summary: unknown,
  tenantId: string,
): ValidEntitlementSummary | null {
  if (!isRecord(summary) || !isRecord(summary.entitlement)) return null;
  const entitlement = summary.entitlement;
  if (
    typeof summary.isActive !== "boolean" ||
    entitlement.tenant_id !== tenantId ||
    entitlement.code !== CUSTOM_SUPPORT_BRANDING ||
    !Number.isSafeInteger(entitlement.version) ||
    typeof entitlement.version !== "number" ||
    entitlement.version <= 0 ||
    !isEntitlementStatus(entitlement.status) ||
    !isFiniteDate(entitlement.starts_at) ||
    !isFiniteDate(entitlement.expires_at)
  ) return null;
  return {
    isActive: summary.isActive,
    entitlement: {
      status: entitlement.status,
      starts_at: entitlement.starts_at,
      expires_at: entitlement.expires_at,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntitlementStatus(
  value: unknown,
): value is ValidEntitlementSummary["entitlement"]["status"] {
  return value === "active" ||
    value === "suspended" ||
    value === "expired" ||
    value === "revoked";
}

function isFiniteDate(value: unknown): value is string {
  return typeof value === "string" &&
    Number.isFinite(new Date(value).getTime());
}

function validDisplayName(value: string | null): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const length = Array.from(value).length;
  return length >= 2 &&
    length <= 40 &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) &&
    !/^[\p{P}\p{S}\s]+$/u.test(value);
}

function normalizedDate(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function validPublicHttpUrl(value: string | null | undefined): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /\s/u.test(value) ||
    !/^https?:\/\/[^/?#\s]+(?:[/?#]|$)/iu.test(value)
  ) return null;
  try {
    const url = new URL(value);
    return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname.length > 0 &&
        url.username.length === 0 &&
        url.password.length === 0
      )
      ? value
      : null;
  } catch {
    return null;
  }
}

export const effectiveBrandingService = new EffectiveBrandingService();
