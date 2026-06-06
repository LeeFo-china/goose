import { Errors } from "@/errors/error-factory";
import {
  visitorPictureCommentsRepository,
  type VisitorPictureCommentRecord,
  type PictureCommentImageRecord,
} from "@/repositories/visitor-picture-comments";
import {
  visitorPictureLibraryRepository,
  type VisitorPictureInteractionState,
  type VisitorPictureAssetRecord,
  type VisitorPictureVariantRow,
  type VisitorPictureShareEventRecord,
} from "@/repositories/visitor-picture-library";
import type {
  CreateVisitorPictureCommentInput,
  CreateVisitorPictureShareEventInput,
  VisitorPictureAssetNavigationQuery,
  VisitorPictureAssetListQuery,
  VisitorPictureCommentListQuery,
} from "@/schema/visitor-picture-library";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

const LIST_IMAGE_VARIANTS = ["thumb", "cover", "original", "large"] as const;
const DETAIL_IMAGE_VARIANTS = ["large", "cover", "original", "thumb"] as const;
const SHARE_IMAGE_VARIANTS = ["cover", "large", "thumb", "original"] as const;
const DEFAULT_SHARE_TITLE = "装修效果图";
const NAVIGATION_SORT = "sort_order asc, created_at desc, id desc";
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

type AssetListDebugTiming = Record<string, number | string | null>;

type PublicCacheEntry<TValue> = {
  expiresAt: number;
  value: TValue;
};

class VisitorPictureLibraryService {
  private publicCache = new Map<string, PublicCacheEntry<unknown>>();
  private publicInFlight = new Map<string, Promise<unknown>>();

  async listCategories() {
    return this.getPublicCached("categories", () => this.loadCategories());
  }

  async listAssets(query: VisitorPictureAssetListQuery, visitorId: string | null = null) {
    const timing = query.debug_timing ? this.createAssetListTiming() : null;
    const startedAt = Date.now();
    const cacheResult = await this.getPublicCachedResult(
      this.buildAssetListCacheKey(query),
      () => this.loadPublicAssets(query, timing),
    );
    if (timing) timing.cache = cacheResult.cache;
    const data = visitorId
      ? await this.withInteractionStates(cacheResult.value, visitorId, timing)
      : cacheResult.value;
    if (!timing) return data;
    timing.total_ms = Date.now() - startedAt;
    return { ...data, debug_timing: timing };
  }

  async getAssetDetail(id: string, visitorId: string | null = null) {
    if (!visitorId) {
      return this.getPublicCached(`asset-detail:${id}`, () =>
        this.loadAssetDetail(id, null)
      );
    }

    return this.loadAssetDetail(id, visitorId);
  }

  async getAssetNavigation(
    id: string,
    query: VisitorPictureAssetNavigationQuery,
    visitorId: string | null = null,
  ) {
    if (!visitorId) {
      return this.getPublicCached(this.buildNavigationCacheKey(id, query), () =>
        this.loadAssetNavigation(id, query, null)
      );
    }

    return this.loadAssetNavigation(id, query, visitorId);
  }

  async setLike(input: {
    assetId: string;
    visitorId: string;
    liked: boolean;
  }) {
    const result = await visitorPictureLibraryRepository.setLike(
      input.assetId,
      input.visitorId,
      input.liked,
    );
    this.clearPublicCache();
    return result;
  }

  async setFavorite(input: {
    assetId: string;
    visitorId: string;
    favorited: boolean;
  }) {
    const result = await visitorPictureLibraryRepository.setFavorite(
      input.assetId,
      input.visitorId,
      input.favorited,
    );
    this.clearPublicCache();
    return result;
  }

  async listComments(assetId: string, query: VisitorPictureCommentListQuery) {
    const page = await visitorPictureCommentsRepository.list(assetId, query);
    return {
      list: page.list.map((comment) => this.toComment(comment)),
      pagination: page.pagination,
    };
  }

  async createComment(input: {
    assetId: string;
    visitorId: string;
    body: CreateVisitorPictureCommentInput;
  }) {
    const comment = await visitorPictureCommentsRepository.create(input);
    this.clearPublicCache();
    return this.toComment(comment);
  }

  async recordShareEvent(input: {
    assetId: string;
    visitorId: string;
    body: CreateVisitorPictureShareEventInput;
  }) {
    const event = await visitorPictureLibraryRepository.recordShareEvent(
      input.assetId,
      input.visitorId,
      input.body.channel,
    );
    this.clearPublicCache();
    return this.toShareEvent(event);
  }

  clearPublicCache() {
    this.publicCache.clear();
  }

  private async loadCategories() {
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

  private async loadPublicAssets(
    query: VisitorPictureAssetListQuery,
    timing: AssetListDebugTiming | null,
  ) {
    const page = await this.measureAssetListStep(timing, "query_ms", () =>
      visitorPictureLibraryRepository.listAssets(query)
    );
    if (timing) timing.row_count = page.list.length;
    const startedAt = Date.now();
    const list = page.list.map((asset) => this.toAssetListItem(asset, undefined));
    if (timing) timing.serialize_ms = Date.now() - startedAt;
    return {
      list,
      pagination: page.pagination,
    };
  }

  private async withInteractionStates(
    data: Awaited<ReturnType<VisitorPictureLibraryService["loadPublicAssets"]>>,
    visitorId: string,
    timing: AssetListDebugTiming | null,
  ) {
    const states = await this.measureAssetListStep(timing, "visitor_state_ms", () =>
      visitorPictureLibraryRepository.findInteractionStates(
        data.list.map((asset) => asset.id),
        visitorId,
      )
    );
    return {
      ...data,
      list: data.list.map((asset) => {
        const state = states.get(asset.id);
        return {
          ...asset,
          liked_by_me: state?.likedByMe ?? false,
          favorited_by_me: state?.favoritedByMe ?? false,
        };
      }),
    };
  }

  private async loadAssetDetail(id: string, visitorId: string | null) {
    const asset = await visitorPictureLibraryRepository.findAssetDetail(id);
    if (!asset) throw Errors.notFound("图片不存在或未发布");
    const states = await visitorPictureLibraryRepository.findInteractionStates([asset.id], visitorId);
    return this.toAssetDetail(asset, states.get(asset.id));
  }

  private async loadAssetNavigation(
    id: string,
    query: VisitorPictureAssetNavigationQuery,
    visitorId: string | null,
  ) {
    const current = await visitorPictureLibraryRepository.findAssetDetail(id);
    if (!current) throw Errors.notFound("图片不存在或未发布");

    const categoryId = this.resolveNavigationCategoryId(current, query.category_id);
    const assets = await visitorPictureLibraryRepository.findNavigationAssets(categoryId);
    const currentIndex = assets.findIndex((asset) => asset.id === current.id);
    if (currentIndex < 0) throw Errors.badRequest("当前图片不在导航上下文中");

    const prevAsset = currentIndex > 0 ? assets[currentIndex - 1] : null;
    const nextAsset = currentIndex < assets.length - 1 ? assets[currentIndex + 1] : null;
    const requestedPrev = query.direction !== "next" ? prevAsset : null;
    const requestedNext = query.direction !== "prev" ? nextAsset : null;
    const states = await visitorPictureLibraryRepository.findInteractionStates(
      [current, requestedPrev, requestedNext]
        .filter((asset): asset is VisitorPictureAssetRecord => Boolean(asset))
        .map((asset) => asset.id),
      visitorId,
    );

    return {
      current: this.toAssetDetail(current, states.get(current.id)),
      prev: requestedPrev ? this.toAssetDetail(requestedPrev, states.get(requestedPrev.id)) : null,
      next: requestedNext ? this.toAssetDetail(requestedNext, states.get(requestedNext.id)) : null,
      context: {
        category_id: categoryId,
        direction: query.direction,
        limit: query.limit,
        sort: NAVIGATION_SORT,
        has_prev: Boolean(prevAsset),
        has_next: Boolean(nextAsset),
        prev_cursor: prevAsset?.id ?? null,
        next_cursor: nextAsset?.id ?? null,
      },
    };
  }

  private toAssetListItem(
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
      image: this.toImage(asset, LIST_IMAGE_VARIANTS),
      categories: this.toCategories(asset),
      created_at: asset.created_at,
      updated_at: asset.updated_at,
    };
  }

  private toAssetDetail(
    asset: VisitorPictureAssetRecord,
    state: VisitorPictureInteractionState | undefined,
  ) {
    return {
      ...this.toAssetListItem(asset, state),
      image: this.toImage(asset, DETAIL_IMAGE_VARIANTS),
      images: {
        detail: this.toVariantImage(asset.variants.find((item) => item.variant === "detail") ?? null),
        thumb: this.toVariantImage(asset.variants.find((item) => item.variant === "thumb") ?? null),
        cover: this.toVariantImage(asset.variants.find((item) => item.variant === "cover") ?? null),
        large: this.toVariantImage(asset.variants.find((item) => item.variant === "large") ?? null),
        original: this.toVariantImage(asset.variants.find((item) => item.variant === "original") ?? null),
      },
      share: {
        title: this.buildShareTitle(asset),
        image: this.toImage(asset, SHARE_IMAGE_VARIANTS),
        path: `/packageVisitor/pages/picture-library-detail/index?id=${asset.id}`,
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

  private buildShareTitle(asset: VisitorPictureAssetRecord) {
    const categoryName = asset.categories[0]?.name.trim();
    if (!categoryName) return DEFAULT_SHARE_TITLE;
    if (categoryName.includes("效果图")) return categoryName;
    return `${categoryName}${DEFAULT_SHARE_TITLE}`;
  }

  private resolveNavigationCategoryId(
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

  private toComment(comment: VisitorPictureCommentRecord) {
    return {
      id: comment.id,
      asset_id: comment.asset_id,
      visitor_id: comment.visitor_id,
      content: comment.content,
      status: comment.status,
      images: comment.images.map((image) => this.toCommentImage(image)).filter(Boolean),
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    };
  }

  private toCommentImage(image: PictureCommentImageRecord) {
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

  private toShareEvent(event: VisitorPictureShareEventRecord) {
    return {
      id: event.id,
      asset_id: event.asset_id,
      visitor_id: event.visitor_id,
      channel: event.channel,
      share_count: event.share_count,
      created_at: event.created_at,
    };
  }

  private buildAssetListCacheKey(query: VisitorPictureAssetListQuery) {
    return [
      "assets",
      query.category_id || "all",
      query.page,
      query.pageSize,
    ].join(":");
  }

  private createAssetListTiming(): AssetListDebugTiming {
    return {
      cache: null,
      total_ms: 0,
      query_ms: 0,
      visitor_state_ms: 0,
      serialize_ms: 0,
      row_count: 0,
    };
  }

  private async measureAssetListStep<TValue>(
    timing: AssetListDebugTiming | null,
    key: string,
    loader: () => Promise<TValue>,
  ) {
    if (!timing) return loader();
    const startedAt = Date.now();
    const value = await loader();
    timing[key] = Date.now() - startedAt;
    return value;
  }

  private buildNavigationCacheKey(id: string, query: VisitorPictureAssetNavigationQuery) {
    return [
      "asset-navigation",
      id,
      query.category_id || "auto",
      query.direction,
      query.limit,
    ].join(":");
  }

  private async getPublicCached<TValue>(
    key: string,
    loader: () => Promise<TValue>,
  ) {
    return (await this.getPublicCachedResult(key, loader)).value;
  }

  private async getPublicCachedResult<TValue>(
    key: string,
    loader: () => Promise<TValue>,
  ): Promise<{ value: TValue; cache: "hit" | "miss" | "shared" }> {
    const now = Date.now();
    const cached = this.publicCache.get(key) as PublicCacheEntry<TValue> | undefined;
    if (cached && cached.expiresAt > now) return { value: cached.value, cache: "hit" };

    const shared = this.publicInFlight.get(key) as Promise<TValue> | undefined;
    if (shared) return { value: await shared, cache: "shared" };

    const promise = loader();
    this.publicInFlight.set(key, promise);
    try {
      const value = await promise;
      this.publicCache.set(key, { value, expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS });
      return { value, cache: "miss" };
    } finally {
      this.publicInFlight.delete(key);
    }
  }

}

export const visitorPictureLibraryService = new VisitorPictureLibraryService();
