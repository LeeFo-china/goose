import { Errors } from "@/errors/error-factory";
import { pictureLibraryRepository } from "@/repositories/picture-library";
import type {
  CreatePictureAssetInput,
  CreatePictureCategoryInput,
  PictureAssetListQuery,
  PictureCategoryListQuery,
  UpdatePictureAssetInput,
  UpdatePictureCategoryInput,
} from "@/schema/picture-library";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import type { PlatformAuditLogAction } from "@/schema/platform-audit-logs";

class PictureLibraryService {
  async listCategories(query: PictureCategoryListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return pictureLibraryRepository.listCategories(query);
  }

  async createCategory(input: CreatePictureCategoryInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    await this.assertCategorySlugAvailable(input.slug);
    await this.assertOptionalAsset(input.cover_asset_id);
    const category = await pictureLibraryRepository.createCategory(input);
    await this.recordAudit(authContext, "picture_category_create", category.id, category.name, {
      slug: category.slug,
    });
    return category;
  }

  async updateCategory(id: string, input: UpdatePictureCategoryInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const existing = await this.getRequiredCategory(id);
    if (input.slug && input.slug !== existing.slug) {
      await this.assertCategorySlugAvailable(input.slug);
    }
    await this.assertOptionalAsset(input.cover_asset_id);
    const category = await pictureLibraryRepository.updateCategory(id, input);
    if (!category) throw Errors.notFound("图片分类不存在");
    await this.recordAudit(authContext, "picture_category_update", category.id, category.name, {
      input,
    });
    return category;
  }

  async disableCategory(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const category = await pictureLibraryRepository.updateCategory(id, { status: "inactive" });
    if (!category) throw Errors.notFound("图片分类不存在");
    await this.recordAudit(authContext, "picture_category_disable", category.id, category.name, {
      slug: category.slug,
    });
    return category;
  }

  async listAssets(query: PictureAssetListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return pictureLibraryRepository.listAssets(query);
  }

  async createAsset(input: CreatePictureAssetInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    await this.assertCategories(input.category_ids);
    const file = await pictureLibraryRepository.findFileObject(input.file_object_id);
    if (!file || file.deleted_at || file.status !== "active") {
      throw Errors.badRequest("图片文件不存在或不可用");
    }
    if (file.scene !== "picture_library") {
      throw Errors.badRequest("图片文件场景不属于资料库");
    }

    const asset = await pictureLibraryRepository.createAsset(input, file);
    if (!asset) throw Errors.badRequest("创建图片失败");
    await this.recordAudit(authContext, "picture_asset_create", asset.id, asset.title, {
      status: asset.status,
      category_ids: input.category_ids,
      file_object_id: file.id,
    });
    return asset;
  }

  async updateAsset(id: string, input: UpdatePictureAssetInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    await this.getRequiredAsset(id);
    if (input.category_ids) await this.assertCategories(input.category_ids);
    const asset = await pictureLibraryRepository.updateAsset(id, input);
    if (!asset) throw Errors.notFound("图片不存在");
    await this.recordAudit(authContext, "picture_asset_update", asset.id, asset.title, {
      input,
    });
    return asset;
  }

  async updateAssetStatus(
    id: string,
    status: "published" | "hidden" | "draft",
    authContext: AuthContext,
  ) {
    this.assertPlatformAdmin(authContext);
    const asset = await pictureLibraryRepository.updateAssetStatus(id, status);
    if (!asset) throw Errors.notFound("图片不存在");
    await this.recordAudit(authContext, `picture_asset_${status}`, asset.id, asset.title, {
      status,
    });
    return asset;
  }

  async deleteAsset(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const asset = await pictureLibraryRepository.softDeleteAsset(id);
    if (!asset) throw Errors.notFound("图片不存在");
    await this.recordAudit(authContext, "picture_asset_delete", asset.id, asset.title, {
      soft_deleted: true,
    });
    return asset;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private async assertCategorySlugAvailable(slug: string) {
    const existing = await pictureLibraryRepository.findCategoryBySlug(slug);
    if (existing) {
      throw Errors.business(409, "分类标识已存在", "PICTURE_CATEGORY_SLUG_EXISTS", {
        slug,
      });
    }
  }

  private async assertOptionalAsset(assetId: string | null | undefined) {
    if (!assetId) return;
    await this.getRequiredAsset(assetId);
  }

  private async assertCategories(categoryIds: string[]) {
    for (const categoryId of categoryIds) {
      const category = await pictureLibraryRepository.findCategoryById(categoryId);
      if (!category || category.status !== "active") {
        throw Errors.badRequest("图片分类不存在或已停用");
      }
    }
  }

  private async getRequiredCategory(id: string) {
    const category = await pictureLibraryRepository.findCategoryById(id);
    if (!category) throw Errors.notFound("图片分类不存在");
    return category;
  }

  private async getRequiredAsset(id: string) {
    const asset = await pictureLibraryRepository.findAssetById(id);
    if (!asset) throw Errors.notFound("图片不存在");
    return asset;
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
      resourceType: "picture_library",
      resourceId,
      resourceLabel,
      summary: resourceLabel,
      metadata,
    });
  }
}

export const pictureLibraryService = new PictureLibraryService();
