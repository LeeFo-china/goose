import { Errors } from "@/errors/error-factory";
import {
  visitorPictureLibraryRepository,
  type VisitorPictureAssetRecord,
  type VisitorPictureVariantRow,
} from "@/repositories/visitor-picture-library";
import type { VisitorPictureAssetListQuery } from "@/schema/visitor-picture-library";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

const LIST_IMAGE_VARIANTS = ["thumb", "cover", "original", "large"] as const;
const DETAIL_IMAGE_VARIANTS = ["large", "cover", "original", "thumb"] as const;

class VisitorPictureLibraryService {
  async listCategories() {
    const categories = await visitorPictureLibraryRepository.listCategories();
    const coverIds = categories
      .map((item) => item.cover_asset_id)
      .filter((value): value is string => Boolean(value));
    const [coverAssets, fallbackCoverAssets] = await Promise.all([
      visitorPictureLibraryRepository.findCoverAssets(coverIds),
      visitorPictureLibraryRepository.findFirstPublishedAssetsByCategoryIds(
        categories.map((item) => item.id),
      ),
    ]);

    return categories.map((category) => {
      const coverAsset = category.cover_asset_id
        ? coverAssets.get(category.cover_asset_id) ?? null
        : null;
      const fallbackCoverAsset = fallbackCoverAssets.get(category.id) ?? null;
      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sort_order: category.sort_order,
        asset_count: category.asset_count,
        cover_image: this.toImage(coverAsset ?? fallbackCoverAsset, LIST_IMAGE_VARIANTS),
      };
    });
  }

  async listAssets(query: VisitorPictureAssetListQuery) {
    const page = await visitorPictureLibraryRepository.listAssets(query);
    return {
      list: page.list.map((asset) => this.toAssetListItem(asset)),
      pagination: page.pagination,
    };
  }

  async getAssetDetail(id: string) {
    const asset = await visitorPictureLibraryRepository.findAssetDetail(id);
    if (!asset) throw Errors.notFound("图片不存在或未发布");
    return this.toAssetDetail(asset);
  }

  private toAssetListItem(asset: VisitorPictureAssetRecord) {
    return {
      id: asset.id,
      title: asset.title,
      description: asset.description,
      width: asset.width,
      height: asset.height,
      like_count: asset.like_count,
      favorite_count: asset.favorite_count,
      comment_count: asset.comment_count,
      share_count: asset.share_count,
      image: this.toImage(asset, LIST_IMAGE_VARIANTS),
      categories: this.toCategories(asset),
      created_at: asset.created_at,
      updated_at: asset.updated_at,
    };
  }

  private toAssetDetail(asset: VisitorPictureAssetRecord) {
    return {
      ...this.toAssetListItem(asset),
      image: this.toImage(asset, DETAIL_IMAGE_VARIANTS),
      images: {
        thumb: this.toVariantImage(asset.variants.find((item) => item.variant === "thumb") ?? null),
        cover: this.toVariantImage(asset.variants.find((item) => item.variant === "cover") ?? null),
        large: this.toVariantImage(asset.variants.find((item) => item.variant === "large") ?? null),
        original: this.toVariantImage(asset.variants.find((item) => item.variant === "original") ?? null),
      },
    };
  }

  private toCategories(asset: VisitorPictureAssetRecord) {
    return asset.categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    }));
  }

  private toImage(
    asset: VisitorPictureAssetRecord | null,
    variantOrder: readonly string[],
  ) {
    if (!asset) return null;
    for (const variant of variantOrder) {
      const matched = asset.variants.find((item) => item.variant === variant);
      const image = this.toVariantImage(matched ?? null);
      if (image) return image;
    }
    return null;
  }

  private toVariantImage(variant: VisitorPictureVariantRow | null) {
    if (!variant) return null;
    const url = resolveStoredFileUrl(variant.object_key);
    if (!url) return null;
    return {
      url,
      variant: variant.variant,
      width: variant.width,
      height: variant.height,
      file_size: variant.file_size,
      mime_type: variant.mime_type,
    };
  }
}

export const visitorPictureLibraryService = new VisitorPictureLibraryService();
