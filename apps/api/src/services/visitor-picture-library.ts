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
  VisitorPictureLibraryScope,
} from "@/schema/visitor-picture-library";
import {
  resolveNavigationCategoryId,
  toAssetCoverImage,
  toAssetDetail,
  toAssetListItem,
  toComment,
  toShareEvent,
} from "@/services/visitor-picture-library-serializer";
import {
  PublicCacheStore,
  applyPublicCacheTiming,
  type PublicCacheTiming,
} from "@/services/visitor-picture-public-cache";
import * as pictureLibraryTiming from "@/services/visitor-picture-library-timing";

const PUBLIC_CACHE_VERSION = "picture-library:v3";
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_PREVIEW_PAGE_SIZE = 6;

type AssetListDebugTiming = PublicCacheTiming;
type DebugTiming = PublicCacheTiming;
type CommentDebugTiming = pictureLibraryTiming.CommentDebugTiming;
type AssetDetailResponse = ReturnType<typeof toAssetDetail>;

type NavigationResponse = {
  current: AssetDetailResponse;
  prev: AssetDetailResponse | null;
  next: AssetDetailResponse | null;
  prev_list: AssetDetailResponse[];
  next_list: AssetDetailResponse[];
  context: VisitorPictureNavigationContext;
};

class VisitorPictureLibraryService {
  private publicCache = new PublicCacheStore(PUBLIC_CACHE_TTL_MS);

  async listCategories(query: { debug_timing?: boolean } = {}) {
    const timing = query.debug_timing ? pictureLibraryTiming.createCategoryTiming() : null;
    const startedAt = Date.now();
    const cacheResult = await this.publicCache.getResult(
      "categories",
      () => this.loadCategories(),
      timing,
    );
    applyPublicCacheTiming(timing, cacheResult);
    if (!timing) return cacheResult.value;
    timing.total_ms = Date.now() - startedAt;
    timing.row_count = cacheResult.value.length;
    return {
      list: cacheResult.value,
      debug_timing: timing,
    };
  }

  async listAssets(query: VisitorPictureAssetListQuery, visitorId: string | null = null) {
    const timing = query.debug_timing ? pictureLibraryTiming.createAssetListTiming() : null;
    const startedAt = Date.now();
    if (this.isPersonalScope(query.scope)) {
      const requiredVisitorId = this.requireVisitorId(visitorId);
      const personalData = await this.loadAssets(query, requiredVisitorId, timing);
      const data = await this.withInteractionStates(personalData, requiredVisitorId, timing);
      if (!timing) return data;
      timing.total_ms = Date.now() - startedAt;
      return { ...data, debug_timing: timing };
    }

    const cacheResult = await this.publicCache.getResult(
      this.buildAssetListCacheKey(query),
      (loaderTiming) => this.loadAssets(query, null, loaderTiming as AssetListDebugTiming | null),
      timing,
    );
    applyPublicCacheTiming(timing, cacheResult);
    const data = visitorId
      ? await this.withInteractionStates(cacheResult.value, visitorId, timing)
      : cacheResult.value;
    if (!timing) return data;
    timing.total_ms = Date.now() - startedAt;
    return { ...data, debug_timing: timing };
  }

  async getAssetDetail(id: string, visitorId: string | null = null) {
    if (!visitorId) {
      return this.publicCache.get(`asset-detail:${id}`, () =>
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
    const timing = query.debug_timing ? pictureLibraryTiming.createNavigationTiming() : null;
    const startedAt = Date.now();
    const baseQuery = { ...query, direction: "both" as const };
    if (this.isPersonalScope(query.scope)) {
      const requiredVisitorId = this.requireVisitorId(visitorId);
      const loaded = await this.loadAssetNavigation(id, baseQuery, timing, requiredVisitorId);
      const filtered = this.filterNavigationDirection(loaded, query);
      const data = await this.withNavigationInteractionStates(filtered, requiredVisitorId, timing);
      if (!timing) return data;

      timing.row_count = this.countNavigationRows(data);
      timing.total_ms = Date.now() - startedAt;
      return { ...data, debug_timing: timing };
    }

    const cacheResult = await this.publicCache.getResult(
      this.buildNavigationCacheKey(id, baseQuery),
      (loaderTiming) => this.loadAssetNavigation(id, baseQuery, loaderTiming, null),
      timing,
    );
    applyPublicCacheTiming(timing, cacheResult);

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
    const timing = query.debug_timing ? pictureLibraryTiming.createCommentTiming() : null;
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

  refreshPublicCacheSoon() {
    this.clearPublicCache();
    this.prewarmPublicListCache().catch(() => null);
  }

  async prewarmPublicListCache() {
    const categories = await this.publicCache.get("categories", () => this.loadCategories());
    const category = categories.find((item) => item.asset_count > 0);
    const [previewAssets, assets] = await Promise.all([
      this.listAssets({
        scope: "all",
        category_id: category?.id,
        page: 1,
        pageSize: PUBLIC_PREVIEW_PAGE_SIZE,
        debug_timing: false,
      }, null),
      this.listAssets({
        scope: "all",
        category_id: category?.id,
        page: 1,
        pageSize: 20,
        debug_timing: false,
      }, null),
    ]);
    const navigationAssets = assets.list.length > 0 ? assets : previewAssets;
    await Promise.all(
      navigationAssets.list.slice(0, 5).map((asset) =>
        this.getAssetNavigation(asset.id, {
          category_id: category?.id,
          scope: "all",
          direction: "both",
          limit: 5,
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

  private async loadAssets(
    query: VisitorPictureAssetListQuery,
    visitorId: string | null,
    timing: AssetListDebugTiming | null,
  ) {
    const page = await this.measureStep(timing, "query_ms", () =>
      visitorPictureLibraryRepository.listAssets(query, visitorId)
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
    data: Awaited<ReturnType<VisitorPictureLibraryService["loadAssets"]>>,
    visitorId: string,
    timing: AssetListDebugTiming | null,
  ) {
    const states = await this.measureStep(timing, "visitor_state_ms", () =>
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
    visitorId: string | null,
  ): Promise<NavigationResponse> {
    const bundle = await this.measureStep(timing, "query_ms", () =>
      visitorPictureNavigationRepository.findBundle({
        assetId: id,
        categoryId: query.category_id ?? null,
        scope: query.scope,
        visitorId,
        direction: query.direction,
        limit: query.limit,
      })
    );
    if (!bundle.current || !bundle.context) {
      await this.assertNavigationAssetContext(id, query);
    }

    const startedAt = Date.now();
    const current = bundle.current as VisitorPictureAssetRecord;
    const context = bundle.context as VisitorPictureNavigationContext;
    const response = {
      current: toAssetDetail(current, undefined),
      prev: bundle.prev ? toAssetDetail(bundle.prev, undefined) : null,
      next: bundle.next ? toAssetDetail(bundle.next, undefined) : null,
      prev_list: bundle.prevList.map((asset) => toAssetDetail(asset, undefined)),
      next_list: bundle.nextList.map((asset) => toAssetDetail(asset, undefined)),
      context: {
        ...context,
        direction: query.direction,
        limit: query.limit,
      },
    };
    if (timing) timing.serialize_ms = Date.now() - startedAt;
    return response;
  }

  private async assertNavigationAssetContext(
    id: string,
    query: VisitorPictureAssetNavigationQuery,
  ) {
    const asset = await visitorPictureLibraryRepository.findAssetDetail(id);
    if (!asset) throw Errors.notFound("图片不存在或未发布");
    if (this.isPersonalScope(query.scope)) {
      throw Errors.business(
        400,
        query.scope === "favorites" ? "当前图片不在收藏集合中" : "当前图片不在点赞集合中",
        "PICTURE_LIBRARY_ASSET_NOT_IN_COLLECTION",
      );
    }
    if (query.category_id) resolveNavigationCategoryId(asset, query.category_id);
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
      prev_list: query.direction !== "next" ? data.prev_list : [],
      next_list: query.direction !== "prev" ? data.next_list : [],
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
    const assets = [data.current, ...data.prev_list, ...data.next_list].filter(
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
      prev_list: data.prev_list.map((asset) => this.applyInteractionState(asset, states)),
      next_list: data.next_list.map((asset) => this.applyInteractionState(asset, states)),
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
      query.scope,
      query.category_id || "all",
      query.page,
      query.pageSize,
    ].join(":");
  }

  private countNavigationRows(data: NavigationResponse) {
    return 1 + data.prev_list.length + data.next_list.length;
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
      query.scope,
      query.category_id || "auto",
      query.direction,
      query.limit,
    ].join(":");
  }

  private isPersonalScope(scope: VisitorPictureLibraryScope) {
    return scope === "favorites" || scope === "likes";
  }

  private requireVisitorId(visitorId: string | null) {
    if (!visitorId) throw Errors.unauthorized("请先完成手机号验证");
    return visitorId;
  }

}

export const visitorPictureLibraryService = new VisitorPictureLibraryService();
