import { Errors } from "@/errors/error-factory";
import type {
  PictureCommentImageRecord,
  VisitorPictureCommentRecord,
} from "@/repositories/visitor-picture-comments";
import type {
  VisitorPictureAssetRecord,
  VisitorPictureInteractionState,
  VisitorPictureShareEventRecord,
  VisitorPictureVariantRow,
} from "@/repositories/visitor-picture-library";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

const LIST_IMAGE_VARIANTS = ["thumb", "cover", "original", "large"] as const;
const DETAIL_IMAGE_VARIANTS = ["large", "cover", "original", "thumb"] as const;
const SHARE_IMAGE_VARIANTS = ["cover", "large", "thumb", "original"] as const;
const DEFAULT_SHARE_TITLE = "装修效果图";

export const NAVIGATION_SORT = "sort_order asc, created_at desc, id desc";

export function toAssetCoverImage(asset: VisitorPictureAssetRecord | null) {
  return toImage(asset, LIST_IMAGE_VARIANTS);
}

export function toAssetListItem(
  asset: VisitorPictureAssetRecord,
  state: VisitorPictureInteractionState | undefined,
) {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    width: asset.width,
    height: asset.height,
    like_count: asset.like_count,
    favorite_count: asset.favorite_count,
    liked_by_me: state?.likedByMe ?? false,
    favorited_by_me: state?.favoritedByMe ?? false,
    comment_count: asset.comment_count,
    share_count: asset.share_count,
    image: toImage(asset, LIST_IMAGE_VARIANTS),
    categories: toCategories(asset),
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

export function toAssetDetail(
  asset: VisitorPictureAssetRecord,
  state: VisitorPictureInteractionState | undefined,
) {
  return {
    ...toAssetListItem(asset, state),
    image: toImage(asset, DETAIL_IMAGE_VARIANTS),
    images: {
      detail: toVariantImage(asset.variants.find((item) => item.variant === "detail") ?? null),
      thumb: toVariantImage(asset.variants.find((item) => item.variant === "thumb") ?? null),
      cover: toVariantImage(asset.variants.find((item) => item.variant === "cover") ?? null),
      large: toVariantImage(asset.variants.find((item) => item.variant === "large") ?? null),
      original: toVariantImage(asset.variants.find((item) => item.variant === "original") ?? null),
    },
    share: {
      title: buildShareTitle(asset),
      image: toImage(asset, SHARE_IMAGE_VARIANTS),
      path: `/packageVisitor/pages/picture-library-detail/index?id=${asset.id}`,
    },
  };
}

export function resolveNavigationCategoryId(
  asset: VisitorPictureAssetRecord,
  requestedCategoryId: string | undefined,
) {
  if (requestedCategoryId) {
    const belongsToCategory = asset.categories.some((category) => category.id === requestedCategoryId);
    if (!belongsToCategory) throw Errors.badRequest("当前图片不属于传入分类");
    return requestedCategoryId;
  }
  return asset.categories[0]?.id ?? null;
}

export function toComment(comment: VisitorPictureCommentRecord) {
  return {
    id: comment.id,
    asset_id: comment.asset_id,
    visitor_id: comment.visitor_id,
    content: comment.content,
    status: comment.status,
    images: comment.images.map((image) => toCommentImage(image)).filter(Boolean),
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

export function toShareEvent(event: VisitorPictureShareEventRecord) {
  return {
    id: event.id,
    asset_id: event.asset_id,
    visitor_id: event.visitor_id,
    channel: event.channel,
    share_count: event.share_count,
    created_at: event.created_at,
  };
}

function toCategories(asset: VisitorPictureAssetRecord) {
  return asset.categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
  }));
}

function toImage(
  asset: VisitorPictureAssetRecord | null,
  variantOrder: readonly string[],
) {
  if (!asset) return null;
  for (const variant of variantOrder) {
    const matched = asset.variants.find((item) => item.variant === variant);
    const image = toVariantImage(matched ?? null);
    if (image) return image;
  }
  return null;
}

function toVariantImage(variant: VisitorPictureVariantRow | null) {
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

function buildShareTitle(asset: VisitorPictureAssetRecord) {
  const categoryName = asset.categories[0]?.name.trim();
  if (!categoryName) return DEFAULT_SHARE_TITLE;
  if (categoryName.includes("效果图")) return categoryName;
  return `${categoryName}${DEFAULT_SHARE_TITLE}`;
}

function toCommentImage(image: PictureCommentImageRecord) {
  const fileObject = image.file_object;
  if (!fileObject) return null;
  const url = resolveStoredFileUrl(fileObject.object_key);
  if (!url) return null;
  return {
    id: image.id,
    file_object_id: image.file_object_id,
    url,
    width: fileObject.width,
    height: fileObject.height,
    file_size: fileObject.size_bytes,
    mime_type: fileObject.mime_type,
  };
}
