import type { DouyinAppContext } from "../../app";
import { isApiRequestErrorCode } from "../../api/request";
import { fetchSites } from "../../api/sites";
import { resolveThemeColor } from "../../components/theme";
import type { PublicProject } from "../../models";
import { navigateToEntityDetail } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import { toPublicSitePresentation } from "./view-model";

Page({
  pagination: createPaginationState<PublicProject>(20),
  data: {
    items: [] as PublicProject[],
    firstLoading: true,
    firstError: false,
    paginationStatus: "idle",
    disabled: false,
    featureReady: false,
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
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
      };
      if (!bootstrap.features.sites) {
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
      const result = await fetchSites(getApp<DouyinAppContext>().api, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
      });
      this.pagination = resolvePaginationRequest(this.pagination, pending.request, result);
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
      items: this.pagination.items.map(toPublicSitePresentation),
      firstLoading: this.pagination.status === "loading" && this.pagination.items.length === 0,
      firstError: this.pagination.status === "error" && this.pagination.items.length === 0,
      paginationStatus: this.pagination.status,
    });
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onSiteSelect(event: { detail: { id?: string } }) {
    if (!event.detail.id) return;
    void navigateToEntityDetail("site", event.detail.id)
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
