import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  brandingRepository,
  type BrandProfileRecord,
} from "@/repositories/branding";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type {
  BrandingDraftInput,
  BrandingPublishInput,
} from "@/schema/branding";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { mapBrandProfileMutationError } from "@/services/brand-profile-errors";
import { assertValidBrandLogoFile } from "@/services/branding-file-policy";
import { serializeBrandProfile } from "@/services/branding-contracts";
import { tenantEntitlementsService } from "@/services/tenant-entitlements";

type BrandingRepositoryPort = Pick<
  typeof brandingRepository,
  | "findPlatformProfile"
  | "findTenantProfile"
  | "findBrandingFileForPlatform"
  | "findBrandingFileForTenant"
  | "saveDraft"
  | "publish"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;

type TenantEntitlementsPort = Pick<
  typeof tenantEntitlementsService,
  "getTenantSummary" | "assertCanCustomize"
>;

export type BrandProfilesServiceDependencies = {
  brandingRepository?: BrandingRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
  tenantEntitlementsService?: TenantEntitlementsPort;
  nowFactory?: () => Date;
};

const PLATFORM_MANAGE_PERMISSION = "platform.branding.manage";
const TENANT_READ_PERMISSION = "brand.settings.read";
const TENANT_UPDATE_PERMISSION = "brand.settings.update";

export class BrandProfilesService {
  private readonly brandingRepository: BrandingRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly tenantEntitlementsService: TenantEntitlementsPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: BrandProfilesServiceDependencies = {}) {
    this.brandingRepository = dependencies.brandingRepository ??
      brandingRepository;
    this.accessPolicyService = dependencies.accessPolicyService ??
      accessPolicyService;
    this.tenantEntitlementsService = dependencies.tenantEntitlementsService ??
      tenantEntitlementsService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async getPlatform(authContext: AuthContext) {
    this.requirePlatformEmployee(authContext);
    const profile = await this.findPlatformProfile();
    return {
      profile: await this.serializePlatformProfile(profile),
    };
  }

  async savePlatformDraft(
    authContext: AuthContext,
    input: BrandingDraftInput,
  ) {
    const actorEmployeeId = this.requirePlatformEmployee(authContext);
    const file = await this.requirePlatformFile(input.logo_file_id);
    const profile = await this.saveDraft({
      scope: "platform",
      tenantId: null,
      displayName: input.display_name,
      logoFileId: input.logo_file_id,
      expectedVersion: input.version,
      actorEmployeeId,
    });
    return { profile: serializeBrandProfile(profile, file.public_url) };
  }

  async publishPlatform(
    authContext: AuthContext,
    input: BrandingPublishInput,
  ) {
    const actorEmployeeId = this.requirePlatformEmployee(authContext);
    const draft = await this.findPlatformProfile();
    assertCompleteDraft(draft);
    const file = await this.requirePlatformFile(draft.logo_file_id);
    const profile = await this.publish({
      scope: "platform",
      tenantId: null,
      expectedVersion: input.version,
      actorEmployeeId,
    });
    return { profile: serializeBrandProfile(profile, file.public_url) };
  }

  async getTenant(authContext: AuthContext) {
    const { tenantId } = this.requireTenantEmployee(authContext);
    this.assertPermission(authContext, TENANT_READ_PERMISSION);
    const profile = await this.findTenantProfile(tenantId);
    const summary = await this.tenantEntitlementsService.getTenantSummary(
      tenantId,
      this.nowFactory(),
    );
    const canCustomize = Boolean(
      summary?.isActive &&
        this.accessPolicyService.hasPermission(
          authContext,
          TENANT_UPDATE_PERMISSION,
        ),
    );

    return {
      profile: await this.serializeTenantProfile(profile, tenantId),
      entitlement: summary?.entitlement ?? null,
      can_customize: canCustomize,
    };
  }

  async saveTenantDraft(
    authContext: AuthContext,
    input: BrandingDraftInput,
  ) {
    const { tenantId, employeeId } = this.requireTenantEmployee(authContext);
    await this.tenantEntitlementsService.assertCanCustomize(
      authContext,
      this.nowFactory(),
    );
    const file = await this.requireTenantFile(input.logo_file_id, tenantId);
    const profile = await this.saveDraft({
      scope: "tenant",
      tenantId,
      displayName: input.display_name,
      logoFileId: input.logo_file_id,
      expectedVersion: input.version,
      actorEmployeeId: employeeId,
    });
    return { profile: serializeBrandProfile(profile, file.public_url) };
  }

  async publishTenant(
    authContext: AuthContext,
    input: BrandingPublishInput,
  ) {
    const { tenantId, employeeId } = this.requireTenantEmployee(authContext);
    await this.tenantEntitlementsService.assertCanCustomize(
      authContext,
      this.nowFactory(),
    );
    const draft = await this.findTenantProfile(tenantId);
    assertCompleteDraft(draft);
    const file = await this.requireTenantFile(draft.logo_file_id, tenantId);
    const profile = await this.publish({
      scope: "tenant",
      tenantId,
      expectedVersion: input.version,
      actorEmployeeId: employeeId,
    });
    return { profile: serializeBrandProfile(profile, file.public_url) };
  }

  private requirePlatformEmployee(authContext: AuthContext): string {
    if (
      !authContext.isPlatformAdmin ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      !this.accessPolicyService.hasPermission(
        authContext,
        PLATFORM_MANAGE_PERMISSION,
      )
    ) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private requireTenantEmployee(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (authContext.isPlatformAdmin || !authContext.employeeId) {
      throw Errors.forbidden();
    }
    return { tenantId, employeeId: authContext.employeeId };
  }

  private assertPermission(
    authContext: AuthContext,
    permissionCode: string,
  ): void {
    if (!this.accessPolicyService.hasPermission(authContext, permissionCode)) {
      throw Errors.forbidden();
    }
  }

  private async findPlatformProfile() {
    try {
      return await this.brandingRepository.findPlatformProfile();
    } catch {
      throw Errors.dbError("查询平台品牌资料失败");
    }
  }

  private async findTenantProfile(tenantId: string) {
    try {
      return await this.brandingRepository.findTenantProfile(tenantId);
    } catch {
      throw Errors.dbError("查询租户品牌资料失败");
    }
  }

  private async loadPlatformFile(fileId: string) {
    try {
      return await this.brandingRepository.findBrandingFileForPlatform(fileId);
    } catch {
      throw Errors.dbError("查询品牌 Logo 文件失败");
    }
  }

  private async loadTenantFile(fileId: string, tenantId: string) {
    try {
      return await this.brandingRepository.findBrandingFileForTenant(
        fileId,
        tenantId,
      );
    } catch {
      throw Errors.dbError("查询品牌 Logo 文件失败");
    }
  }

  private async requirePlatformFile(fileId: string) {
    return assertValidBrandLogoFile(
      { tenantId: null },
      await this.loadPlatformFile(fileId),
    );
  }

  private async requireTenantFile(fileId: string, tenantId: string) {
    return assertValidBrandLogoFile(
      { tenantId },
      await this.loadTenantFile(fileId, tenantId),
    );
  }

  private async serializePlatformProfile(profile: BrandProfileRecord | null) {
    if (!profile) return null;
    const file = await this.loadPlatformFile(profile.logo_file_id);
    return serializeBrandProfile(
      profile,
      validManagementLogoUrl({ tenantId: null }, file),
    );
  }

  private async serializeTenantProfile(
    profile: BrandProfileRecord | null,
    tenantId: string,
  ) {
    if (!profile) return null;
    const file = await this.loadTenantFile(profile.logo_file_id, tenantId);
    return serializeBrandProfile(
      profile,
      validManagementLogoUrl({ tenantId }, file),
    );
  }

  private async saveDraft(
    input: Parameters<BrandingRepositoryPort["saveDraft"]>[0],
  ) {
    try {
      return await this.brandingRepository.saveDraft(input);
    } catch (error) {
      throw mapBrandProfileMutationError(error, "save");
    }
  }

  private async publish(
    input: Parameters<BrandingRepositoryPort["publish"]>[0],
  ) {
    try {
      return await this.brandingRepository.publish(input);
    } catch (error) {
      throw mapBrandProfileMutationError(error, "publish");
    }
  }
}

function assertCompleteDraft(
  profile: BrandProfileRecord | null,
): asserts profile is BrandProfileRecord {
  if (!profile?.display_name.trim() || !profile.logo_file_id) {
    throw Errors.business(
      400,
      "品牌草稿资料不完整",
      ErrorCodes.BRANDING_PROFILE_INCOMPLETE,
    );
  }
}

function validManagementLogoUrl(
  scope: { tenantId: string | null },
  file: BrandingPlatformFileObjectRecord | null,
): string | null {
  try {
    return assertValidBrandLogoFile(scope, file).public_url;
  } catch (error) {
    if (
      isAppErrorCode(error, ErrorCodes.BRANDING_LOGO_FILE_NOT_FOUND) ||
      isAppErrorCode(error, ErrorCodes.BRANDING_LOGO_FILE_INVALID)
    ) {
      return null;
    }
    throw error;
  }
}

function isAppErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}

export const brandProfilesService = new BrandProfilesService();
