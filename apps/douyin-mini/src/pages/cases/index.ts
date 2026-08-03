import type { DouyinAppContext } from "../../app";
import { fetchCases } from "../../api/cases";
import { isApiRequestErrorCode } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import type { PublicProject } from "../../models";
import { navigateToEntityDetail } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import {
  clearCaseFilters,
  hasActiveCaseFilters,
  toggleCaseFilter,
} from "./filter-state";

Page({
  pagination: createPaginationState<PublicProject>(20),
  data: {
    items: [] as PublicProject[],
    firstLoading: true,
    firstError: false,
    paginationStatus: "idle",
    styleOptions: [] as string[],
    layoutOptions: [] as string[],
    selectedStyle: "",
    selectedLayout: "",
    disabled: false,
    featureReady: false,
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
    activeFilterStyle: "border-color: #191817; background-color: #191817; color: #FFFFFF;",
    hasActiveFilters: false,
  },
  onLoad() { void this.initialize(); },
  onReachBottom() {
    if (this.data.featureReady) void this.load("loadMore");
  },
  onPullDownRefresh() {
    if (!this.data.featureReady) {
      void tt.stopPullDownRefresh({});
      return;
    }
    void this.load("refresh");
  },
  async initialize() {
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      const themeData = {
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
        activeFilterStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
      };
      if (!bootstrap.features.cases) {
        this.setData({
          firstLoading: false,
          disabled: true,
          featureReady: true,
          ...themeData,
        });
        return;
      }
      this.setData({ featureReady: true, ...themeData });
      await this.load("loadMore");
    } catch {
      this.setData({ firstLoading: false, firstError: true });
    }
  },
  async load(mode: "loadMore" | "refresh" | "retry") {
    if (!this.data.featureReady || this.data.disabled) {
      if (mode === "refresh") void tt.stopPullDownRefresh({});
      return;
    }
    if (mode === "loadMore" && (this.pagination.status === "loading"
      || this.pagination.status === "end")) return;
    const pending = beginPaginationRequest(this.pagination, mode);
    this.pagination = pending.state;
    this.syncState();
    try {
      const result = await fetchCases(getApp<DouyinAppContext>().api, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
        ...(this.data.selectedStyle ? { style: this.data.selectedStyle } : {}),
        ...(this.data.selectedLayout ? { layout: this.data.selectedLayout } : {}),
      });
      const isCurrentRequest = pending.request.sequence === this.pagination.requestSequence;
      this.pagination = resolvePaginationRequest(this.pagination, pending.request, result);
      if (isCurrentRequest) {
        this.setData({
          styleOptions: mergeOptions(this.data.styleOptions,
            result.items.flatMap((item) => item.style_tags)),
          layoutOptions: mergeOptions(this.data.layoutOptions,
            result.items.map((item) => item.layout)
              .filter((item): item is string => Boolean(item))),
        });
      }
    } catch (error) {
      if (isApiRequestErrorCode(error, "DOUYIN_CONTENT_FEATURE_DISABLED")) {
        this.pagination = createPaginationState<PublicProject>(20);
        this.setData({ disabled: true });
      } else {
        this.pagination = rejectPaginationRequest(this.pagination, pending.request);
      }
    } finally {
      this.syncState();
      if (mode === "refresh") void tt.stopPullDownRefresh({});
    }
  },
  syncState() {
    this.setData({
      items: this.pagination.items,
      firstLoading: this.pagination.status === "loading" && this.pagination.items.length === 0,
      firstError: this.pagination.status === "error" && this.pagination.items.length === 0,
      paginationStatus: this.pagination.status,
    });
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onSelectStyle(event: { currentTarget: { dataset: { value?: string } } }) {
    this.applyFilters(toggleCaseFilter(
      this.data,
      "style",
      event.currentTarget.dataset.value || "",
    ));
  },
  onSelectLayout(event: { currentTarget: { dataset: { value?: string } } }) {
    this.applyFilters(toggleCaseFilter(
      this.data,
      "layout",
      event.currentTarget.dataset.value || "",
    ));
  },
  onClearFilters() {
    if (!hasActiveCaseFilters(this.data)) return;
    this.applyFilters(clearCaseFilters());
  },
  applyFilters(filters: { selectedStyle: string; selectedLayout: string }) {
    this.setData({
      ...filters,
      hasActiveFilters: hasActiveCaseFilters(filters),
    });
    void this.load("refresh");
  },
  onCaseSelect(event: { detail: { id?: string } }) {
    if (!event.detail.id) return;
    void navigateToEntityDetail("case", event.detail.id)
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});

function mergeOptions(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming])].slice(0, 8);
}
