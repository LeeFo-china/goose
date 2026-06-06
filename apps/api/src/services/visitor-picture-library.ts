import { Errors } from "@/errors/error-factory";
import {
  visitorPictureCommentsRepository,
} from "@/repositories/visitor-picture-comments";
import {
  visitorPictureLibraryRepository,
  type VisitorPictureAssetRecord,
} from "@/repositories/visitor-picture-library";
import {
  visitorPictureNavigationRepository,
  type VisitorPictureNavigationContext,
} from "@/repositories/visitor-picture-navigation";
import type {
  CreateVisitorPictureCommentInput,
  CreateVisitorPictureShareEventInput,
  VisitorPictureAssetNavigationQuery,
  VisitorPictureAssetListQuery,
  VisitorPictureCommentListQuery,
} from "@/schema/visitor-picture-library";
import {
  resolveNavigationCategoryId,
  toAssetCoverImage,
  toAssetDetail,
  toAssetListItem,
  toComment,
  toShareEvent,
} from "@/services/visitor-picture-library-serializer";

const PUBLIC_CACHE_VERSION = "picture-library:v2";
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

type AssetListDebugTiming = Record<string, number | string | null>;
type DebugTiming = Record<string, number | string | null>;
type AssetDetailResponse = ReturnType<typeof toAssetDetail>;

type NavigationResponse = {
  current: AssetDetailResponse;
  prev: AssetDetailResponse | null;
  next: AssetDetailResponse | null;
  context: VisitorPictureNavigationContext;
};

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
    const timing = query.debug_timing ? this.createNavigationTiming() : null;
    const startedAt = Date.now();
    const baseQuery = { ...query, direction: "both" as const };
    const cacheResult = await this.getPublicCachedResult(
      this.buildNavigationCacheKey(id, baseQuery),
      () => this.loadAssetNavigation(id, baseQuery, timing),
    );
    if (timing) timing.cache = cacheResult.cache;

    const filtered = this.filterNavigationDirection(cacheResult.value, query);
    const data = visitorId
      ? await this.withNavigationInteractionStates(filtered, visitorId, timing)
      : filtered;
    if (!timing) return data;

    timing.row_count = this.countNavigationRows(data);
    timing.total_ms = Date.now() - startedAt;
    return { ...data, debug_timing: timing };
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
    const timing = query.debug_timing ? this.createCommentTiming() : null;
    const startedAt = Date.now();
    const page = await visitorPictureCommentsRepository.list(assetId, query, timing);
    const serializeStartedAt = Date.now();
    const list = page.list.map((comment) => toComment(comment));
    if (timing) timing.serialize_ms = Date.now() - serializeStartedAt;
    if (timing) timing.total_ms = Date.now() - startedAt;
    if (timing) timing.row_count = list.length;
    return {
      list,
      pagination: page.pagination,
      ...(timing ? { debug_timing: timing } : {}),
    };
  }

  async createComment(input: {
    assetId: string;
    visitorId: string;
    body: CreateVisitorPictureCommentInput;
  }) {
    const comment = await visitorPictureCommentsRepository.create(input);
    this.clearPublicCache();
    return toComment(comment);
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
    return toShareEvent(event);
  }

  clearPublicCache() {
    this.publicCache.clear();
  }

  async prewarmPublicListCache() {
    const categories = await this.listCategories();
    const category = categories.find((item) => item.asset_count > 0);
    const assets = await this.listAssets({
      category_id: category?.id,
      page: 1,
      pageSize: 20,
      debug_timing: false,
    }, null);
    await Promise.all(
      assets.list.slice(0, 5).map((asset) =>
        this.getAssetNavigation(asset.id, {
          category_id: category?.id,
          direction: "both",
          limit: 1,
          debug_timing: false,
        }, null).catch(() => null)
      )
    );
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
        cover_image: toAssetCoverImage(coverAsset ?? fallbackCoverAsset),
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
    const list = page.list.map((asset) => toAssetListItem(asset, undefined));
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
    return toAssetDetail(asset, states.get(asset.id));
  }

  private async loadAssetNavigation(
    id: string,
    query: VisitorPictureAssetNavigationQuery,
    timing: DebugTiming | null,
  ): Promise<NavigationResponse> {
    const bundle = await this.measureStep(timing, "query_ms", () =>
      visitorPictureNavigationRepository.findBundle({
        assetId: id,
        categoryId: query.category_id ?? null,
        direction: query.direction,
        limit: query.limit,
      })
    );
    if (!bundle.current || !bundle.context) {
      await this.assertNavigationAssetContext(id, query.category_id);
    }

    const startedAt = Date.now();
    const current = bundle.current as VisitorPictureAssetRecord;
    const context = bundle.context as VisitorPictureNavigationContext;
    const response = {
      current: toAssetDetail(current, undefined),
      prev: bundle.prev ? toAssetDetail(bundle.prev, undefined) : null,
      next: bundle.next ? toAssetDetail(bundle.next, undefined) : null,
      context: {
        ...context,
        direction: query.direction,
        limit: query.limit,
      },
    };
    if (timing) timing.serialize_ms = Date.now() - startedAt;
    return response;
  }

  private async assertNavigationAssetContext(id: string, categoryId: string | undefined) {
    const asset = await visitorPictureLibraryRepository.findAssetDetail(id);
    if (!asset) throw Errors.notFound("图片不存在或未发布");
    if (categoryId) resolveNavigationCategoryId(asset, categoryId);
    throw Errors.badRequest("当前图片不在导航上下文中");
  }

  private filterNavigationDirection(
    data: NavigationResponse,
    query: VisitorPictureAssetNavigationQuery,
  ): NavigationResponse {
    return {
      ...data,
      prev: query.direction !== "next" ? data.prev : null,
      next: query.direction !== "prev" ? data.next : null,
      context: {
        ...data.context,
        direction: query.direction,
        limit: query.limit,
      },
    };
  }

  private async withNavigationInteractionStates(
    data: NavigationResponse,
    visitorId: string,
    timing: DebugTiming | null,
  ): Promise<NavigationResponse> {
    const assets = [data.current, data.prev, data.next].filter(
      (asset): asset is AssetDetailResponse => Boolean(asset),
    );
    const states = await this.measureStep(timing, "visitor_state_ms", () =>
      visitorPictureLibraryRepository.findInteractionStates(
        assets.map((asset) => asset.id),
        visitorId,
      )
    );
    return {
      ...data,
      current: this.applyInteractionState(data.current, states),
      prev: data.prev ? this.applyInteractionState(data.prev, states) : null,
      next: data.next ? this.applyInteractionState(data.next, states) : null,
    };
  }

  private applyInteractionState(
    asset: AssetDetailResponse,
    states: Awaited<ReturnType<typeof visitorPictureLibraryRepository.findInteractionStates>>,
  ) {
    const state = states.get(asset.id);
    return {
      ...asset,
      liked_by_me: state?.likedByMe ?? false,
      favorited_by_me: state?.favoritedByMe ?? false,
    };
  }

  private buildAssetListCacheKey(query: VisitorPictureAssetListQuery) {
    return [
      PUBLIC_CACHE_VERSION,
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

  private createNavigationTiming(): DebugTiming {
    return {
      cache: null,
      total_ms: 0,
      query_ms: 0,
      visitor_state_ms: 0,
      serialize_ms: 0,
      row_count: 0,
    };
  }

  private createCommentTiming(): DebugTiming {
    return {
      total_ms: 0,
      query_ms: 0,
      images_ms: 0,
      serialize_ms: 0,
      row_count: 0,
    };
  }

  private countNavigationRows(data: NavigationResponse) {
    return [data.current, data.prev, data.next].filter(Boolean).length;
  }

  private async measureAssetListStep<TValue>(
    timing: AssetListDebugTiming | null,
    key: string,
    loader: () => Promise<TValue>,
  ) {
    return this.measureStep(timing, key, loader);
  }

  private async measureStep<TValue>(
    timing: DebugTiming | null,
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
      PUBLIC_CACHE_VERSION,
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
