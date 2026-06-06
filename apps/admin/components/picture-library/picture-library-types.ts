export type PictureCategoryStatus = "active" | "inactive";
export type PictureAssetStatus = "draft" | "published" | "hidden" | "deleted";

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
