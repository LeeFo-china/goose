import type { DouyinAppContext } from "../../app";
import { fetchMaterials } from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import { navigateToMaterialDetail, navigateToPage } from "../../platform/navigation";
import {
  applyMaterialKeyword,
  beginMaterialListLoad,
  createMaterialListPageState,
  failMaterialListLoad,
  MaterialExperienceLifecycle,
  resolveMaterialListLoad,
  updateMaterialKeyword,
  type MaterialListPageState,
  type MaterialListRequest,
  type MaterialOperationAuthority,
} from "./page-model";

Page({
  pageState: createMaterialListPageState(20),
  debounceTimer: null as ReturnType<typeof setTimeout> | null,
  featureReady: false,
  lifecycle: new MaterialExperienceLifecycle(),
  data: {
    items: [] as MaterialListPageState["pagination"]["items"],
    keyword: "",
    firstLoading: true,
    firstError: false,
    empty: false,
    paginationStatus: "idle",
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
  },
  onLoad() {
    if (this.lifecycle.onLoad()) void this.initialize();
  },
  onShow() {
    if (!this.lifecycle.onShow()) return;
    this.syncState();
    if (!this.featureReady) {
      void this.initialize();
      return;
    }
    const keyword = applyMaterialKeyword(
      this.pageState,
      this.pageState.debounceSequence,
    );
    if (keyword.request) {
      const authority = this.lifecycle.beginOperation();
      if (authority) {
        this.pageState = keyword.state;
        void this.executeLoad(keyword.state, keyword.request, false, authority);
      }
      return;
    }
    void this.load("refresh");
  },
  onHide() { this.lifecycle.onHide(); },
  onUnload() {
    this.lifecycle.onUnload();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  },
  onReachBottom() { void this.load("loadMore"); },
  onPullDownRefresh() { void this.load("refresh"); },
  async initialize() {
    const authority = this.lifecycle.beginOperation();
    if (!authority) return;
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap || !this.lifecycle.isCurrent(authority)) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      this.featureReady = true;
      this.setData({
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
      });
      getApp<DouyinAppContext>().recordAnalytics("page_view");
      await this.load("loadMore");
    } catch {
      if (this.lifecycle.isCurrent(authority)) {
        this.setData({ firstLoading: false, firstError: true });
      }
    }
  },
  async load(mode: "loadMore" | "refresh" | "retry") {
    const authority = this.lifecycle.beginOperation();
    if (!authority) return;
    if (!this.featureReady) {
      if (mode === "refresh") void tt.stopPullDownRefresh({});
      return;
    }
    const pending = beginMaterialListLoad(this.pageState, mode);
    if (!pending) {
      if (mode === "refresh") void tt.stopPullDownRefresh({});
      return;
    }
    await this.executeLoad(
      pending.state,
      pending.request,
      mode === "refresh",
      authority,
    );
  },
  async executeLoad(
    state: MaterialListPageState,
    request: MaterialListRequest,
    stopRefresh: boolean,
    authority: MaterialOperationAuthority,
  ) {
    if (!this.lifecycle.isCurrent(authority)) return;
    this.pageState = state;
    this.syncState();
    try {
      const result = await fetchMaterials(getApp<DouyinAppContext>().api, {
        page: request.page,
        pageSize: request.pageSize,
        ...(request.keyword ? { keyword: request.keyword } : {}),
      });
      if (!this.lifecycle.isCurrent(authority)) return;
      this.pageState = resolveMaterialListLoad(this.pageState, request, result);
    } catch {
      if (!this.lifecycle.isCurrent(authority)) return;
      this.pageState = failMaterialListLoad(this.pageState, request);
    } finally {
      if (this.lifecycle.isCurrent(authority)) {
        this.syncState();
        if (stopRefresh) void tt.stopPullDownRefresh({});
      }
    }
  },
  syncState() {
    if (!this.lifecycle.beginOperation()) return;
    this.setData({
      items: this.pageState.pagination.items,
      keyword: this.pageState.keyword,
      firstLoading: this.pageState.view.firstLoading,
      firstError: this.pageState.view.firstError,
      empty: this.pageState.view.empty,
      paginationStatus: this.pageState.view.paginationStatus,
    });
  },
  onKeywordInput(event: { detail: { value?: string } }) {
    const changed = updateMaterialKeyword(
      this.pageState,
      typeof event.detail.value === "string" ? event.detail.value : "",
    );
    this.pageState = changed.state;
    this.syncState();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      const pending = applyMaterialKeyword(this.pageState, changed.debounce.sequence);
      this.pageState = pending.state;
      this.syncState();
      if (pending.request) {
        void this.executeLoad(pending.state, pending.request, false, authority);
      }
    }, changed.debounce.delayMs);
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onOpenMine() { navigateWithFeedback(navigateToPage("pages/my-materials/index")); },
  onMaterialSelect(event: { detail: { id?: string } }) {
    if (event.detail.id) navigateWithFeedback(navigateToMaterialDetail(event.detail.id));
  },
});

function navigateWithFeedback(promise: Promise<void>): void {
  void promise.catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
}
