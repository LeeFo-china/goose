export type PictureCategoryStatus = "active" | "inactive";
export type PictureAssetStatus = "draft" | "published" | "hidden" | "deleted";
export type PictureCommentStatus = "pending" | "visible" | "hidden" | "rejected" | "deleted";

export type PictureAssetVariant = {
  id: string;
  asset_id: string;
  variant: "thumb" | "cover" | "large" | "original" | string;
  file_object_id: string;
  object_key: string;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
  created_at: string;
};

export type PictureCategoryRecord = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  cover_asset_id: string | null;
  sort_order: number;
  status: PictureCategoryStatus;
  asset_count?: number;
  cover_asset?: PictureAssetRecord | null;
  created_at: string;
  updated_at: string;
};

export type PictureAssetRecord = {
  id: string;
  title: string;
  description: string | null;
  source: "server_import" | "admin_upload" | string;
  original_filename: string | null;
  checksum: string | null;
  dominant_color: string | null;
  width: number | null;
  height: number | null;
  status: PictureAssetStatus;
  sort_order: number;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  share_count: number;
  variants: PictureAssetVariant[];
  categories: PictureCategoryRecord[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PictureAssetListData = {
  list: PictureAssetRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PictureCommentImageRecord = {
  id: string;
  comment_id: string;
  file_object_id: string;
  sort_order: number;
  status: string;
  created_at: string;
  file_object: {
    id: string;
    object_key: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
  } | null;
};

export type PictureCommentRecord = {
  id: string;
  asset_id: string;
  visitor_id: string;
  content: string;
  status: PictureCommentStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  asset: {
    id: string;
    title: string;
    status: PictureAssetStatus;
  } | null;
  images: PictureCommentImageRecord[];
};

export type PictureCommentListData = {
  list: PictureCommentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PictureLibraryHealthIssue = {
  type:
    | "missing_variant"
    | "uncategorized_asset"
    | "category_without_cover"
    | "comment_count_mismatch";
  severity: "warning" | "danger";
  resource_type: "asset" | "category";
  resource_id: string;
  resource_label: string;
  detail: string;
};

export type PictureLibraryHealthReport = {
  generated_at: string;
  metrics: {
    category_total: number;
    active_category_total: number;
    inactive_category_total: number;
    asset_total: number;
    published_asset_total: number;
    draft_asset_total: number;
    hidden_asset_total: number;
    deleted_asset_total: number;
    pending_comment_total: number;
    visible_comment_total: number;
    hidden_comment_total: number;
    deleted_comment_total: number;
    missing_variant_asset_total: number;
    uncategorized_asset_total: number;
    category_without_cover_total: number;
    comment_count_mismatch_asset_total: number;
    issue_total: number;
  };
  issues: PictureLibraryHealthIssue[];
};
