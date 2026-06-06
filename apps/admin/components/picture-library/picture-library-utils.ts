import type {
  PictureAssetRecord,
  PictureAssetStatus,
  PictureAssetVariant,
  PictureCommentStatus,
  PictureCategoryStatus,
} from "@/components/picture-library/picture-library-types";

export function getAssetVariant(asset: PictureAssetRecord, variants: string[]) {
  for (const variant of variants) {
    const matched = asset.variants.find((item) => item.variant === variant);
    if (matched) return matched;
  }
  return asset.variants[0] ?? null;
}

export function buildStoredFilePreviewUrl(variant: PictureAssetVariant | null) {
  if (!variant?.object_key) return "";
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(variant.object_key)}`;
}

export function getAssetPreviewUrl(asset: PictureAssetRecord) {
  return buildStoredFilePreviewUrl(getAssetVariant(asset, ["cover", "thumb", "original", "large"]));
}

export function formatPictureDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function getAssetStatusMeta(status: PictureAssetStatus) {
  switch (status) {
    case "published":
      return { label: "已发布", variant: "default" as const };
    case "hidden":
      return { label: "已隐藏", variant: "secondary" as const };
    case "deleted":
      return { label: "已删除", variant: "danger" as const };
    default:
      return { label: "草稿", variant: "outline" as const };
  }
}

export function getCategoryStatusMeta(status: PictureCategoryStatus) {
  return status === "active"
    ? { label: "启用", variant: "default" as const }
    : { label: "停用", variant: "secondary" as const };
}

export function getCommentStatusMeta(status: PictureCommentStatus) {
  switch (status) {
    case "visible":
      return { label: "可见", variant: "default" as const };
    case "hidden":
      return { label: "已隐藏", variant: "secondary" as const };
    case "rejected":
      return { label: "已拒绝", variant: "danger" as const };
    case "deleted":
      return { label: "已删除", variant: "danger" as const };
    default:
      return { label: "待处理", variant: "outline" as const };
  }
}

export function generatePictureSlug(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
