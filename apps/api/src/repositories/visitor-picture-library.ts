import { Errors } from "@/errors/error-factory";
import type {
  CreateVisitorPictureShareEventInput,
  VisitorPictureAssetListQuery,
} from "@/schema/visitor-picture-library";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorPictureCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_asset_id: string | null;
  sort_order: number;
};

export type VisitorPictureAssetRow = {
  id: string;
  title: string;
  description: string | null;
  width: number | null;
  height: number | null;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  share_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type VisitorPictureVariantRow = {
  asset_id: string;
  variant: string;
  object_key: string;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
};

export type VisitorPictureAssetRecord = VisitorPictureAssetRow & {
  variants: VisitorPictureVariantRow[];
  categories: VisitorPictureCategoryRow[];
};

export type VisitorPictureInteractionState = {
  likedByMe: boolean;
  favoritedByMe: boolean;
};

export type VisitorPictureLikeMutationResult = {
  asset_id: string;
  liked: boolean;
  like_count: number;
};

export type VisitorPictureFavoriteMutationResult = {
  asset_id: string;
  favorited: boolean;
  favorite_count: number;
};

export type VisitorPictureShareEventRecord = {
  id: string;
  asset_id: string;
  visitor_id: string | null;
  channel: CreateVisitorPictureShareEventInput["channel"];
  share_count: number;
  created_at: string;
};

class VisitorPictureLibraryRepository {
  async listCategories() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("id,name,slug,description,cover_asset_id,sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw Errors.dbError("查询图片分类失败", error);

    const categories = (data || []) as VisitorPictureCategoryRow[];
    const counts = await this.countPublishedAssetsByCategory(categories.map((item) => item.id));
    return categories.map((item) => ({
      ...item,
      asset_count: counts.get(item.id) ?? 0,
    }));
  }

  async listAssets(query: VisitorPictureAssetListQuery) {
    if (query.category_id) {
      const category = await this.findActiveCategory(query.category_id);
      if (!category) return this.toAssetPage([], query.page, query.pageSize, 0);
    }

    const assetIds = query.category_id
      ? await this.findAssetIdsByCategory(query.category_id)
      : null;
    if (assetIds && assetIds.length === 0) {
      return this.toAssetPage([], query.page, query.pageSize, 0);
    }

    let request = SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select(
        "id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at",
        { count: "exact" },
      )
      .eq("status", "published")
      .is("deleted_at", null);

    if (assetIds) request = request.in("id", assetIds);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询图片列表失败", error);

    const list = await this.attachRelations((data || []) as VisitorPictureAssetRow[]);
    return this.toAssetPage(list, query.page, query.pageSize, count || 0);
  }

  async findAssetDetail(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at")
      .eq("id", id)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片详情失败", error);
    const list = await this.attachRelations(data ? [data as VisitorPictureAssetRow] : []);
    return list[0] ?? null;
  }

  async findCoverAssets(assetIds: string[]) {
    if (assetIds.length === 0) return new Map<string, VisitorPictureAssetRecord>();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at")
      .in("id", assetIds)
      .eq("status", "published")
      .is("deleted_at", null);
    if (error) throw Errors.dbError("查询分类封面失败", error);
    const assets = await this.attachRelations((data || []) as VisitorPictureAssetRow[]);
    return new Map(assets.map((item) => [item.id, item]));
  }

  async findFirstPublishedAssetsByCategoryIds(categoryIds: string[]) {
    const result = new Map<string, VisitorPictureAssetRecord>();
    if (categoryIds.length === 0) return result;

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("category_id, asset_id")
      .in("category_id", categoryIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("查询分类封面失败", error);

    const assetIds = Array.from(new Set((data || []).map((item) => item.asset_id)));
    const assets = await this.findCoverAssets(assetIds);
    for (const item of data || []) {
      if (result.has(item.category_id)) continue;
      const asset = assets.get(item.asset_id);
      if (asset) result.set(item.category_id, asset);
    }
    return result;
  }

  async findInteractionStates(assetIds: string[], visitorId: string | null) {
    const result = new Map<string, VisitorPictureInteractionState>();
    for (const assetId of assetIds) {
      result.set(assetId, { likedByMe: false, favoritedByMe: false });
    }
    if (!visitorId || assetIds.length === 0) return result;

    const [likes, favorites] = await Promise.all([
      this.findLikedAssetIds(assetIds, visitorId),
      this.findFavoritedAssetIds(assetIds, visitorId),
    ]);
    for (const assetId of likes) {
      result.set(assetId, {
        ...(result.get(assetId) || { likedByMe: false, favoritedByMe: false }),
        likedByMe: true,
      });
    }
    for (const assetId of favorites) {
      result.set(assetId, {
        ...(result.get(assetId) || { likedByMe: false, favoritedByMe: false }),
        favoritedByMe: true,
      });
    }
    return result;
  }

  async setLike(assetId: string, visitorId: string, liked: boolean) {
    const { data, error } = await (SupabaseDB.getAdminClient() as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: VisitorPictureLikeMutationResult[] | null;
        error: { code?: string; message?: string } | null;
      }>;
    }).rpc("picture_asset_set_like", {
      p_asset_id: assetId,
      p_visitor_id: visitorId,
      p_liked: liked,
    });
    if (error?.code === "P0002") throw Errors.notFound("图片不存在或未发布");
    if (error) throw Errors.dbError("更新图片点赞失败", error);
    const result = data?.[0];
    if (!result) throw Errors.badRequest("更新图片点赞失败");
    return result;
  }

  async setFavorite(assetId: string, visitorId: string, favorited: boolean) {
    const { data, error } = await (SupabaseDB.getAdminClient() as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: VisitorPictureFavoriteMutationResult[] | null;
        error: { code?: string; message?: string } | null;
      }>;
    }).rpc("picture_asset_set_favorite", {
      p_asset_id: assetId,
      p_visitor_id: visitorId,
      p_favorited: favorited,
    });
    if (error?.code === "P0002") throw Errors.notFound("图片不存在或未发布");
    if (error) throw Errors.dbError("更新图片收藏失败", error);
    const result = data?.[0];
    if (!result) throw Errors.badRequest("更新图片收藏失败");
    return result;
  }

  async recordShareEvent(
    assetId: string,
    visitorId: string,
    channel: CreateVisitorPictureShareEventInput["channel"],
  ) {
    const asset = await this.findPublishedAssetCounter(assetId);
    if (!asset) throw Errors.notFound("图片不存在或未发布");

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_share_events")
      .insert({
        asset_id: assetId,
        visitor_id: visitorId,
        channel,
      })
      .select("id,asset_id,visitor_id,channel,created_at")
      .maybeSingle();
    if (error) throw Errors.dbError("记录图片分享事件失败", error);
    if (!data) throw Errors.badRequest("记录图片分享事件失败");

    const shareCount = await this.incrementShareCount(assetId, asset.share_count);
    return {
      ...(data as Omit<VisitorPictureShareEventRecord, "share_count">),
      share_count: shareCount,
    };
  }

  private async findActiveCategory(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_categories")
      .select("id")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return data;
  }

  private async findPublishedAssetCounter(assetId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_assets")
      .select("id,share_count")
      .eq("id", assetId)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw Errors.dbError("查询图片失败", error);
    return data as { id: string; share_count: number } | null;
  }

  private async incrementShareCount(assetId: string, currentCount: number) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 2_000);
    try {
      const nextCount = currentCount + 1;
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("picture_assets")
        .update({ share_count: nextCount })
        .eq("id", assetId)
        .select("share_count")
        .abortSignal(abortController.signal)
        .maybeSingle();
      if (error) throw Errors.dbError("更新图片分享计数失败", error);
      return Number(data?.share_count ?? nextCount);
    } catch {
      return currentCount;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async findAssetIdsByCategory(categoryId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("asset_id")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true });
    if (error) throw Errors.dbError("查询分类图片失败", error);
    return (data || []).map((item) => item.asset_id);
  }

  private async attachRelations(assets: VisitorPictureAssetRow[]) {
    if (assets.length === 0) return [];
    const ids = assets.map((item) => item.id);
    const [variants, categories] = await Promise.all([
      this.findVariants(ids),
      this.findCategoriesByAssetIds(ids),
    ]);
    return assets.map((asset) => ({
      ...asset,
      variants: variants.filter((item) => item.asset_id === asset.id),
      categories: categories
        .filter((item) => item.asset_id === asset.id)
        .map((item) => item.category),
    }));
  }

  private async findVariants(assetIds: string[]) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_variants")
      .select("asset_id,variant,object_key,width,height,file_size,mime_type")
      .in("asset_id", assetIds);
    if (error) throw Errors.dbError("查询图片规格失败", error);
    return (data || []) as VisitorPictureVariantRow[];
  }

  private async findCategoriesByAssetIds(assetIds: string[]) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("asset_id, picture_categories(id,name,slug,description,cover_asset_id,sort_order)")
      .in("asset_id", assetIds);
    if (error) throw Errors.dbError("查询图片分类失败", error);
    return ((data || []) as unknown as Array<{
      asset_id: string;
      picture_categories: VisitorPictureCategoryRow | VisitorPictureCategoryRow[] | null;
    }>)
      .map((item) => ({
        asset_id: item.asset_id,
        category: Array.isArray(item.picture_categories)
          ? item.picture_categories[0] ?? null
          : item.picture_categories,
      }))
      .filter((item): item is { asset_id: string; category: VisitorPictureCategoryRow } => Boolean(item.category));
  }

  private async countPublishedAssetsByCategory(categoryIds: string[]) {
    const result = new Map<string, number>();
    if (categoryIds.length === 0) return result;

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_categories")
      .select("category_id, picture_assets!inner(id,status,deleted_at)")
      .in("category_id", categoryIds)
      .eq("picture_assets.status", "published")
      .is("picture_assets.deleted_at", null);
    if (error) throw Errors.dbError("统计分类图片数量失败", error);

    for (const item of data || []) {
      result.set(item.category_id, (result.get(item.category_id) || 0) + 1);
    }
    return result;
  }

  private async findLikedAssetIds(assetIds: string[], visitorId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_likes")
      .select("asset_id")
      .in("asset_id", assetIds)
      .eq("visitor_id", visitorId);
    if (error) throw Errors.dbError("查询图片点赞状态失败", error);
    return new Set((data || []).map((item) => item.asset_id));
  }

  private async findFavoritedAssetIds(assetIds: string[], visitorId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("picture_asset_favorites")
      .select("asset_id")
      .in("asset_id", assetIds)
      .eq("visitor_id", visitorId);
    if (error) throw Errors.dbError("查询图片收藏状态失败", error);
    return new Set((data || []).map((item) => item.asset_id));
  }

  private toAssetPage(
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
}

export const visitorPictureLibraryRepository = new VisitorPictureLibraryRepository();
