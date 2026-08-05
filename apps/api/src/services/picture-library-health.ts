import { pictureLibraryHealthRepository } from "@/repositories/picture-library-health";
import type { PlatformAuditLogAction } from "@/schema/platform-audit-logs";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { visitorPictureLibraryService } from "@/services/visitor-picture-library";
import type { PermissionCode } from "@gooes/domain";

class PictureLibraryHealthService {
  async buildReport(input: {
    authContext?: AuthContext;
    issueLimit?: number;
  } = {}) {
    if (input.authContext) this.assertPermission(input.authContext, "platform.picture.read");
    return pictureLibraryHealthRepository.buildReport(input.issueLimit);
  }

  async repairAssetCommentCount(assetId: string, authContext: AuthContext) {
    this.assertPermission(authContext, "platform.picture.manage");
    const result = await pictureLibraryHealthRepository.repairAssetCommentCount(assetId);
    visitorPictureLibraryService.refreshPublicCacheSoon();
    await this.recordAudit(
      authContext,
      "picture_health_comment_count_repair",
      result.asset.id,
      result.asset.title,
      {
        previous_comment_count: result.previous_comment_count,
        repaired_comment_count: result.repaired_comment_count,
      },
    );
    return result;
  }

  async setCategoryCoverFromFirstPublishedAsset(
    categoryId: string,
    authContext: AuthContext,
  ) {
    this.assertPermission(authContext, "platform.picture.manage");
    const result = await pictureLibraryHealthRepository.setCategoryCoverFromFirstPublishedAsset(
      categoryId,
    );
    visitorPictureLibraryService.refreshPublicCacheSoon();
    await this.recordAudit(
      authContext,
      "picture_health_category_cover_repair",
      result.category.id,
      result.category.name,
      {
        previous_cover_asset_id: result.previous_cover_asset_id,
        cover_asset_id: result.cover_asset.id,
        cover_asset_title: result.cover_asset.title,
      },
    );
    return result;
  }

  private assertPermission(authContext: AuthContext, code: PermissionCode) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(authContext, code);
  }

  private async recordAudit(
    authContext: AuthContext,
    action: PlatformAuditLogAction,
    resourceId: string,
    resourceLabel: string,
    metadata: Record<string, unknown>,
  ) {
    await platformAuditLogService.recordBestEffort({
      action,
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "picture_library_health",
      resourceId,
      resourceLabel,
      summary: resourceLabel,
      metadata,
    });
  }
}

export const pictureLibraryHealthService = new PictureLibraryHealthService();
