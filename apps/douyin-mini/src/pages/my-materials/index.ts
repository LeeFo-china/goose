import type { DouyinAppContext } from "../../app";
import {
  clearOwnedMaterials,
  fetchOwnedMaterials,
  removeOwnedMaterial,
} from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import {
  navigateToOwnedMaterialDetail,
  navigateToPage,
} from "../../platform/navigation";
import {
  beginOwnedListLoad,
  beginOwnedMutation,
  cancelOwnedMutation,
  createOwnedMaterialPageState,
  failOwnedListLoad,
  failOwnedMutation,
  resolveOwnedListLoad,
  resolveOwnedMutation,
  type OwnedMaterialPageState,
  type OwnedMutationCommand,
  type OwnedMutationRequest,
} from "./page-model";
import {
  MaterialExperienceLifecycle,
  type MaterialOperationAuthority,
} from "../materials/page-model";

Page({
  pageState: createOwnedMaterialPageState(20),
  featureReady: false,
  lifecycle: new MaterialExperienceLifecycle(),
  data: {
    items: [] as OwnedMaterialPageState["pagination"]["items"],
    firstLoading: true,
    firstError: false,
    empty: false,
    paginationStatus: "idle",
    mutating: false,
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
  },
  onLoad() {
    if (this.lifecycle.onLoad()) void this.initialize();
  },
  onShow() {
    if (!this.lifecycle.onShow()) return;
    this.syncState();
    if (this.featureReady) void this.load("refresh");
    else void this.initialize();
  },
  onHide() {
    if (!this.lifecycle.onHide()) return;
    this.pageState = cancelOwnedMutation(this.pageState);
  },
  onUnload() {
    this.lifecycle.onUnload();
    this.pageState = cancelOwnedMutation(this.pageState);
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
    const pending = beginOwnedListLoad(this.pageState, mode);
    if (!pending) {
      if (mode === "refresh") void tt.stopPullDownRefresh({});
      return;
    }
    this.pageState = pending.state;
    this.syncState();
    try {
      const result = await fetchOwnedMaterials(getApp<DouyinAppContext>().api, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
      });
      if (!this.lifecycle.isCurrent(authority)) return;
      this.pageState = resolveOwnedListLoad(this.pageState, pending.request, result);
    } catch {
      if (!this.lifecycle.isCurrent(authority)) return;
      this.pageState = failOwnedListLoad(this.pageState, pending.request);
    } finally {
      if (this.lifecycle.isCurrent(authority)) {
        this.syncState();
        if (mode === "refresh") void tt.stopPullDownRefresh({});
      }
    }
  },
  syncState() {
    if (!this.lifecycle.beginOperation()) return;
    this.setData({
      items: this.pageState.pagination.items.map((item) => ({ ...item, claimed: true })),
      firstLoading: this.pageState.view.firstLoading,
      firstError: this.pageState.view.firstError,
      empty: this.pageState.view.empty,
      paginationStatus: this.pageState.view.paginationStatus,
      mutating: this.pageState.mutation !== null,
    });
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onMaterialSelect(event: { detail: { claimId?: string } }) {
    if (event.detail.claimId) {
      navigateWithFeedback(navigateToOwnedMaterialDetail(event.detail.claimId));
    }
  },
  onConfirmRemove(event: { currentTarget: { dataset: { claimid?: string } } }) {
    const claimId = event.currentTarget.dataset.claimid;
    if (!claimId || this.pageState.mutation) return;
    const authority = this.lifecycle.beginOperation();
    if (!authority) return;
    tt.showModal({
      title: "移出我的资料",
      content: "移出后将不能继续查看这份正文，可从资料中心重新领取当前版本。",
      confirmText: "移出",
      cancelText: "取消",
      success: (result) => {
        if (result.confirm && this.lifecycle.isCurrent(authority)) {
          void this.executeMutation({ type: "remove", claimId });
        }
      },
    });
  },
  onConfirmClear() {
    if (this.pageState.mutation || this.pageState.pagination.items.length === 0) return;
    const authority = this.lifecycle.beginOperation();
    if (!authority) return;
    tt.showModal({
      title: "清空全部资料",
      content: "将一次移出当前全部资料，之后可在资料中心重新领取。此操作不等同于删除个人信息。",
      confirmText: "清空",
      cancelText: "取消",
      success: (result) => {
        if (result.confirm && this.lifecycle.isCurrent(authority)) {
          void this.executeMutation({ type: "clear" });
        }
      },
    });
  },
  async executeMutation(command: OwnedMutationCommand) {
    const authority = this.lifecycle.beginOperation();
    if (!authority) return;
    const pending = beginOwnedMutation(this.pageState, command);
    if (!pending) return;
    this.pageState = pending.state;
    this.syncState();
    try {
      if (command.type === "remove") {
        await removeOwnedMaterial(getApp<DouyinAppContext>().api, command.claimId);
      } else {
        await clearOwnedMaterials(getApp<DouyinAppContext>().api);
      }
      if (!this.lifecycle.isCurrent(authority)) return;
      const resolved = resolveOwnedMutation(this.pageState, pending.request);
      this.pageState = resolved.state;
      this.syncState();
      if (resolved.shouldReload) await this.load("refresh");
      if (this.lifecycle.isCurrent(authority)) {
        void tt.showToast({
          title: command.type === "clear" ? "已清空" : "已移出",
          icon: "none",
        });
      }
    } catch {
      this.handleMutationFailure(pending.request, authority);
    }
  },
  handleMutationFailure(
    request: OwnedMutationRequest,
    authority: MaterialOperationAuthority,
  ) {
    if (!this.lifecycle.isCurrent(authority)) return;
    this.pageState = failOwnedMutation(this.pageState, request);
    this.syncState();
    if (this.lifecycle.isCurrent(authority)) {
      void tt.showToast({ title: "操作失败，请稍后重试", icon: "none" });
    }
  },
  onBrowseMaterials() {
    navigateWithFeedback(navigateToPage("pages/materials/index"));
  },
});

function navigateWithFeedback(promise: Promise<void>): void {
  void promise.catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
}
