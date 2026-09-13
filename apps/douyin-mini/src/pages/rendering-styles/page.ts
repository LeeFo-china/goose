import type { DouyinAppContext } from "../../app";
import {
  RENDERING_SPACES, RENDERING_STYLES, type PublishedRenderingStyle,
  type RenderingSpace, type RenderingStyle, type fetchPublishedStyles,
} from "../../api/rendering-styles";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import {
  beginPaginationRequest, createPaginationState, rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS } from "./labels";

type SpaceSelection = RenderingSpace | "all";
type StyleSelection = RenderingStyle | "all";
type ListItem = PublishedRenderingStyle & {
  spaceLabel: string; styleLabel: string; sourceLabel: string; imageFailed: boolean;
};

const SPACE_FILTERS = [
  { value: "all", label: "全部空间" },
  ...RENDERING_SPACES.map((value) => ({ value, label: SPACE_LABELS[value] })),
];
const STYLE_FILTERS = [
  { value: "all", label: "全部风格" },
  ...RENDERING_STYLES.map((value) => ({ value, label: STYLE_LABELS[value] })),
];

export type RenderingStylesPageDependencies = {
  getApp(): DouyinAppContext;
  fetchPublishedStyles: typeof fetchPublishedStyles;
  navigateToDetail(id: string): Promise<void>;
  stopPullDownRefresh(): void;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createRenderingStylesPageDefinition(dependencies: RenderingStylesPageDependencies) {
  return definePage({
    pagination: createPaginationState<PublishedRenderingStyle>(20),
    visible: false,
    wasHidden: false,
    ready: false,
    requestEpoch: 0,
    imageFailures: new Set<string>(),
    data: {
      items: [] as ListItem[],
      firstLoading: true,
      firstError: false,
      empty: false,
      blocked: false,
      blockedMessage: "",
      errorTitle: "装修效果图加载失败",
      paginationStatus: "idle",
      selectedSpace: "all" as SpaceSelection,
      selectedStyle: "all" as StyleSelection,
      spaceFilters: SPACE_FILTERS,
      styleFilters: STYLE_FILTERS,
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
      activeFilterStyle: "border-color: #191817; background-color: #191817; color: #FFFFFF;",
    },
    onLoad() { this.visible = true; void this.initialize(); },
    onShow() {
      if (!this.wasHidden) return;
      this.visible = true;
      this.wasHidden = false;
      this.requestEpoch++;
      if (this.ready) void this.load("refresh");
      else void this.initialize();
    },
    onHide() { this.visible = false; this.wasHidden = true; this.requestEpoch++; },
    onUnload() { this.visible = false; this.wasHidden = false; this.requestEpoch++; },
    onReachBottom() { void this.load("loadMore"); },
    onPullDownRefresh() { void this.load("refresh", true); },
    async initialize() {
      const epoch = this.requestEpoch;
      try {
        const bootstrap = await dependencies.getApp().startup;
        if (!this.visible || epoch !== this.requestEpoch || !bootstrap) return;
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        this.ready = true;
        this.setData({
          primaryColor: theme.primaryColor,
          primaryTextColor: theme.primaryTextColor,
          activeFilterStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
        });
        dependencies.getApp().recordAnalytics("page_view");
        await this.load("refresh");
      } catch {
        if (this.visible && epoch === this.requestEpoch) {
          this.setData({ firstLoading: false, firstError: true });
        }
      }
    },
    async load(mode: "loadMore" | "refresh" | "retry", stopRefresh = false) {
      if (!this.ready || !this.visible) {
        if (stopRefresh) dependencies.stopPullDownRefresh();
        return;
      }
      if (mode === "loadMore" && this.pagination.status !== "idle") return;
      if (mode === "retry" && this.pagination.status !== "error") return;
      const epoch = this.requestEpoch;
      const pending = beginPaginationRequest(this.pagination, mode);
      this.pagination = mode === "refresh"
        ? { ...pending.state, items: this.pagination.items }
        : pending.state;
      this.setData({ blocked: false, blockedMessage: "" });
      this.syncState();
      try {
        const result = await dependencies.fetchPublishedStyles(dependencies.getApp().api, {
          page: pending.request.page, pageSize: pending.request.pageSize,
          ...(this.data.selectedSpace === "all" ? {} : { space: this.data.selectedSpace }),
          ...(this.data.selectedStyle === "all" ? {} : { style: this.data.selectedStyle }),
        });
        if (!this.visible || epoch !== this.requestEpoch) return;
        this.pagination = resolvePaginationRequest(this.pagination, pending.request, {
          items: result.list, pagination: result.pagination,
        });
      } catch (error) {
        if (!this.visible || epoch !== this.requestEpoch) return;
        this.pagination = rejectPaginationRequest(this.pagination, pending.request);
        this.handleError(error);
      } finally {
        if (this.visible && epoch === this.requestEpoch) this.syncState();
        if (stopRefresh) dependencies.stopPullDownRefresh();
      }
    },
    handleError(error: unknown) {
      if (error instanceof ApiRequestError) {
        if (error.code === "DOUYIN_INSTALLATION_DISABLED"
          || error.code === "TENANT_NOT_AVAILABLE") {
          this.invalidateCurrentList();
          this.setData({ blocked: true, blockedMessage: "装修公司服务已暂停，请稍后再来。" });
          return;
        }
        if (error.statusCode === 401) {
          this.invalidateCurrentList();
          this.setData({ errorTitle: "登录状态已失效" });
          return;
        }
        if (error.code === "VALIDATION_ERROR" || error.code === "INVALID_RENDERING_QUERY") {
          this.setData({ errorTitle: "筛选条件无效" });
          return;
        }
      }
      this.setData({ errorTitle: "装修效果图加载失败" });
    },
    invalidateCurrentList() {
      this.imageFailures.clear();
      this.pagination = {
        ...this.pagination, items: [], page: 0, total: 0, totalPages: 0,
        status: "error", failedPage: 1,
      };
    },
    syncState() {
      this.setData({
        items: this.pagination.items.map((item) => ({
          ...item,
          spaceLabel: SPACE_LABELS[item.space],
          styleLabel: STYLE_LABELS[item.style],
          sourceLabel: SOURCE_LABELS[item.source_type],
          imageFailed: this.imageFailures.has(item.id),
        })),
        firstLoading: this.pagination.status === "loading" && this.pagination.items.length === 0,
        firstError: this.pagination.status === "error" && this.pagination.items.length === 0
          && !this.data.blocked,
        empty: this.pagination.status === "end" && this.pagination.items.length === 0,
        paginationStatus: this.pagination.status,
      });
    },
    onSelectSpace(event: { currentTarget: { dataset: { value?: string } } }) {
      const value = event.currentTarget.dataset.value;
      if (value !== "all" && !RENDERING_SPACES.some((option) => option === value)) return;
      if (value === this.data.selectedSpace) return;
      this.setData({ selectedSpace: value as SpaceSelection });
      this.resetFilters();
    },
    onSelectStyle(event: { currentTarget: { dataset: { value?: string } } }) {
      const value = event.currentTarget.dataset.value;
      if (value !== "all" && !RENDERING_STYLES.some((option) => option === value)) return;
      if (value === this.data.selectedStyle) return;
      this.setData({ selectedStyle: value as StyleSelection });
      this.resetFilters();
    },
    resetFilters() {
      this.requestEpoch++;
      this.imageFailures.clear();
      this.pagination = createPaginationState<PublishedRenderingStyle>(20);
      this.setData({ blocked: false, blockedMessage: "", errorTitle: "装修效果图加载失败" });
      this.syncState();
      void this.load("refresh");
    },
    onImageError(event: { currentTarget: { dataset: { id?: string } } }) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      this.imageFailures.add(id);
      this.syncState();
    },
    onRetry() { void this.load("retry"); },
    onLoadMore() { void this.load("loadMore"); },
    onSelect(event: { currentTarget: { dataset: { id?: string } } }) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      void dependencies.navigateToDetail(id).catch(() => {
        dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
      });
    },
  });
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}
