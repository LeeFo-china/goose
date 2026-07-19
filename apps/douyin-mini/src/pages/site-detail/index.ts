import type { DouyinAppContext } from "../../app";
import { isApiRequestErrorCode } from "../../api/request";
import { fetchSiteDetail, fetchSiteLogs } from "../../api/sites";
import type { PublicProject, PublicSiteLog } from "../../models";
import { switchToTab } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import { buildSiteProgress, type SiteProgressItem } from "./site-progress";

Page({
  siteId: "",
  logPagination: createPaginationState<PublicSiteLog>(20),
  data: {
    loading: true,
    error: false,
    disabled: false,
    featureReady: false,
    project: null as PublicProject | null,
    statusLabel: "施工中",
    updatedDate: "",
    primaryColor: "#C45A32",
    progress: [] as SiteProgressItem[],
    progressFirstLoading: false,
    progressFirstError: false,
    progressStatus: "idle",
  },
  onLoad(query) {
    this.siteId = query.id || "";
    void this.initialize();
  },
  onReachBottom() {
    if (this.data.featureReady && this.data.project) void this.loadLogs("loadMore");
  },
  onPullDownRefresh() {
    if (!this.data.featureReady || this.data.disabled) {
      void tt.stopPullDownRefresh({});
      return;
    }
    void this.initialize(true);
  },
  async initialize(refresh = false) {
    if (!refresh) this.setData({ loading: true, error: false });
    try {
      const app = getApp<DouyinAppContext>();
      const bootstrap = await app.startup;
      if (!bootstrap) return;
      if (!bootstrap.features.sites) {
        this.setData({ loading: false, disabled: true, featureReady: true });
        return;
      }
      const project = await fetchSiteDetail(app.api, this.siteId);
      this.logPagination = createPaginationState<PublicSiteLog>(20);
      this.setData({
        loading: false,
        error: false,
        disabled: false,
        featureReady: true,
        project,
        statusLabel: project.status === "started" ? "已开工" : "施工中",
        updatedDate: project.updated_at.slice(0, 10),
        primaryColor: bootstrap.theme.primary_color,
        progress: [],
      });
      await this.loadLogs("loadMore");
    } catch (error) {
      if (isApiRequestErrorCode(error, "DOUYIN_CONTENT_FEATURE_DISABLED")) {
        this.logPagination = createPaginationState<PublicSiteLog>(20);
        this.setData({
          loading: false,
          error: false,
          disabled: true,
          project: null,
          progress: [],
        });
      } else if (refresh && this.data.project) {
        void tt.showToast({ title: "刷新失败，已保留当前内容", icon: "none" });
      } else {
        this.setData({ loading: false, error: true });
      }
    } finally {
      if (refresh) void tt.stopPullDownRefresh({});
    }
  },
  async loadLogs(mode: "loadMore" | "retry") {
    if (!this.data.featureReady || this.data.disabled || !this.data.project) return;
    if (mode === "loadMore" && (this.logPagination.status === "loading"
      || this.logPagination.status === "end")) return;
    const pending = beginPaginationRequest(this.logPagination, mode);
    this.logPagination = pending.state;
    this.syncProgress();
    try {
      const result = await fetchSiteLogs(getApp<DouyinAppContext>().api, this.siteId, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
      });
      this.logPagination = resolvePaginationRequest(this.logPagination, pending.request, result);
    } catch (error) {
      if (isApiRequestErrorCode(error, "DOUYIN_CONTENT_FEATURE_DISABLED")) {
        this.logPagination = createPaginationState<PublicSiteLog>(20);
        this.setData({ disabled: true, project: null, progress: [] });
      } else {
        this.logPagination = rejectPaginationRequest(this.logPagination, pending.request);
      }
    } finally {
      this.syncProgress();
    }
  },
  syncProgress() {
    this.setData({
      progress: buildSiteProgress(this.logPagination.items),
      progressFirstLoading: this.logPagination.status === "loading"
        && this.logPagination.items.length === 0,
      progressFirstError: this.logPagination.status === "error"
        && this.logPagination.items.length === 0,
      progressStatus: this.logPagination.status,
    });
  },
  onRetryPage() { void this.initialize(); },
  onRetryProgress() { void this.loadLogs("retry"); },
  onLoadMoreProgress() { void this.loadLogs("loadMore"); },
  onLead() {
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
