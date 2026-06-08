import { Errors } from "@/errors/error-factory";
import type {
  VisitorPictureAssetRecord,
  VisitorPictureAssetRow,
  VisitorPictureCategoryRow,
  VisitorPictureVariantRow,
} from "@/repositories/visitor-picture-library";
import type {
  VisitorPictureAssetListQuery,
  VisitorPictureLibraryScope,
} from "@/schema/visitor-picture-library";
import { SupabaseDB } from "@/utils/supabase";

type VisitorPicturePersonalScope = Exclude<VisitorPictureLibraryScope, "all">;

type VisitorPictureAssetPersonalListRow = {
  asset_id: string;
  created_at: string;
  picture_assets: VisitorPictureAssetRow | VisitorPictureAssetRow[] | null;
};

export function isPersonalPictureLibraryScope(
  scope: VisitorPictureLibraryScope,
): scope is VisitorPicturePersonalScope {
  return scope === "favorites" || scope === "likes";
}

export async function listVisitorPicturePersonalAssets(
  query: VisitorPictureAssetListQuery,
  visitorId: string,
) {
  if (!isPersonalPictureLibraryScope(query.scope)) {
    throw Errors.badRequest("无效的个人集合类型");
  }

  const offset = (query.page - 1) * query.pageSize;
  const { data, error, count } = await SupabaseDB.getAdminClient()
    .from(getPersonalReactionTable(query.scope))
    .select(
      "asset_id,created_at, picture_assets!inner(id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at)",
      { count: "exact" },
    )
    .eq("visitor_id", visitorId)
    .eq("picture_assets.status", "published")
    .is("picture_assets.deleted_at", null)
    .order("created_at", { ascending: false })
    .order("asset_id", { ascending: false })
    .range(offset, offset + query.pageSize - 1);
  if (error) throw Errors.dbError("查询图片个人集合失败", error);

  const records = await attachPersonalAssets(data || []);
  return toAssetPage(records, query.page, query.pageSize, count ?? records.length);
}

export async function findVisitorPicturePersonalNavigationAssets(
  scope: VisitorPicturePersonalScope,
  visitorId: string,
) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from(getPersonalReactionTable(scope))
    .select(
      "asset_id,created_at, picture_assets!inner(id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at)",
    )
    .eq("visitor_id", visitorId)
    .eq("picture_assets.status", "published")
    .is("picture_assets.deleted_at", null)
    .order("created_at", { ascending: false })
    .order("asset_id", { ascending: false });
  if (error) throw Errors.dbError("查询图片个人集合失败", error);

  return attachPersonalAssets(data || []);
}

async function attachPersonalAssets(rows: unknown[]) {
  const assets = (rows as VisitorPictureAssetPersonalListRow[])
    .map((item) => firstRelation(item.picture_assets))
    .filter((asset): asset is VisitorPictureAssetRow => Boolean(asset));
  return attachRelations(assets);
}

async function attachRelations(assets: VisitorPictureAssetRow[]) {
  if (assets.length === 0) return [];
  const ids = assets.map((item) => item.id);
  const [variants, categories] = await Promise.all([
    findVariants(ids),
    findCategoriesByAssetIds(ids),
  ]);
  return assets.map((asset) => ({
    ...asset,
    variants: variants.filter((item) => item.asset_id === asset.id),
    categories: categories
      .filter((item) => item.asset_id === asset.id)
      .map((item) => item.category),
  }));
}

async function findVariants(assetIds: string[]) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("picture_asset_variants")
    .select("asset_id,variant,object_key,width,height,file_size,mime_type")
    .in("asset_id", assetIds)
    .in("variant", ["thumb", "cover", "original", "large"]);
  if (error) throw Errors.dbError("查询图片规格失败", error);
  return (data || []) as VisitorPictureVariantRow[];
}

async function findCategoriesByAssetIds(assetIds: string[]) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("picture_asset_categories")
    .select("asset_id,sort_order,created_at, picture_categories(id,name,slug,description,cover_asset_id,sort_order)")
    .in("asset_id", assetIds)
    .order("asset_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw Errors.dbError("查询图片分类失败", error);
  return ((data || []) as unknown as Array<{
    asset_id: string;
    sort_order: number;
    created_at: string;
    picture_categories: VisitorPictureCategoryRow | VisitorPictureCategoryRow[] | null;
  }>)
    .map((item) => ({
      asset_id: item.asset_id,
      category: firstRelation(item.picture_categories),
    }))
    .filter((item): item is { asset_id: string; category: VisitorPictureCategoryRow } => Boolean(item.category));
}

function getPersonalReactionTable(scope: VisitorPicturePersonalScope) {
  return scope === "favorites" ? "picture_asset_favorites" : "picture_asset_likes";
}

function toAssetPage(
  list: VisitorPictureAssetRecord[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function firstRelation<TValue>(value: TValue | TValue[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
