import type { DouyinAppContext } from "../../app";
import type {
  clearOwnedMaterials, fetchOwnedMaterials, removeOwnedMaterial,
} from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import type { navigateToOwnedMaterialDetail, navigateToPage } from "../../platform/navigation";
import { MaterialExperienceLifecycle, type MaterialOperationAuthority } from "../materials/page-model";
import {
  beginOwnedListLoad, beginOwnedMutation, cancelOwnedMutation,
  createOwnedMaterialPageState, failOwnedListLoad, failOwnedMutation,
  resolveOwnedListLoad, resolveOwnedMutation, type OwnedMaterialPageState,
  type OwnedMutationCommand, type OwnedMutationRequest,
} from "./page-model";

type ModalOptions = Parameters<typeof tt.showModal>[0];
type ConfirmationToken = { sequence: number; command: OwnedMutationCommand };

export type MyMaterialsPageDependencies = {
  getApp(): DouyinAppContext;
  fetchOwnedMaterials: typeof fetchOwnedMaterials;
  removeOwnedMaterial: typeof removeOwnedMaterial;
  clearOwnedMaterials: typeof clearOwnedMaterials;
  navigateToOwnedMaterialDetail: typeof navigateToOwnedMaterialDetail;
  navigateToPage: typeof navigateToPage;
  showModal(options: ModalOptions): void;
  showToast(options: { title: string; icon: "none" }): void;
  stopPullDownRefresh(): void;
};

export function createMyMaterialsPageDefinition(dependencies: MyMaterialsPageDependencies) {
  return definePage({
    pageState: createOwnedMaterialPageState(20),
    featureReady: false,
    confirmationSequence: 0,
    activeConfirmation: null as ConfirmationToken | null,
    mutationSettlement: null as Promise<void> | null,
    mutationNeedsReconcile: false,
    lifecycle: new MaterialExperienceLifecycle(),
    data: {
      items: [] as OwnedMaterialPageState["pagination"]["items"],
      firstLoading: true, firstError: false, empty: false, paginationStatus: "idle",
      mutating: false, primaryColor: "#191817", primaryTextColor: "#FFFFFF",
    },
    onLoad() { if (this.lifecycle.onLoad()) void this.initialize(); },
    onShow() {
      if (!this.lifecycle.onShow()) return;
      this.syncState();
      if (this.featureReady) void this.refreshAfterPendingMutation();
      else void this.initialize();
    },
    onHide() {
      if (!this.lifecycle.onHide()) return;
      this.activeConfirmation = null;
      this.confirmationSequence += 1;
      this.pageState = cancelOwnedMutation(this.pageState);
    },
    onUnload() {
      this.lifecycle.onUnload();
      this.activeConfirmation = null;
      this.confirmationSequence += 1;
      this.pageState = cancelOwnedMutation(this.pageState);
    },
    onReachBottom() { void this.load("loadMore"); },
    onPullDownRefresh() { void this.load("refresh"); },
    async initialize() {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      try {
        const bootstrap = await dependencies.getApp().startup;
        if (!bootstrap || !this.lifecycle.isCurrent(authority)) return;
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        this.featureReady = true;
        this.setData({ primaryColor: theme.primaryColor, primaryTextColor: theme.primaryTextColor });
        dependencies.getApp().recordAnalytics("page_view");
        await this.load("loadMore");
      } catch {
        if (this.lifecycle.isCurrent(authority)) this.setData({ firstLoading: false, firstError: true });
      }
    },
    async load(mode: "loadMore" | "refresh" | "retry") {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      if (!this.featureReady) {
        if (mode === "refresh") dependencies.stopPullDownRefresh();
        return;
      }
      const pending = beginOwnedListLoad(this.pageState, mode);
      if (!pending) {
        if (mode === "refresh") dependencies.stopPullDownRefresh();
        return;
      }
      this.pageState = pending.state;
      this.syncState();
      try {
        const result = await dependencies.fetchOwnedMaterials(dependencies.getApp().api, {
          page: pending.request.page, pageSize: pending.request.pageSize,
        });
        if (!this.lifecycle.isCurrent(authority)) return;
        this.pageState = resolveOwnedListLoad(this.pageState, pending.request, result);
      } catch {
        if (!this.lifecycle.isCurrent(authority)) return;
        this.pageState = failOwnedListLoad(this.pageState, pending.request);
      } finally {
        if (this.lifecycle.isCurrent(authority)) {
          this.syncState();
          if (mode === "refresh") dependencies.stopPullDownRefresh();
        }
      }
    },
    async refreshAfterPendingMutation() {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      const pendingSettlement = this.mutationSettlement;
      if (this.mutationNeedsReconcile && pendingSettlement) await pendingSettlement;
      if (!this.lifecycle.isCurrent(authority)) return;
      await this.load("refresh");
      if (this.lifecycle.isCurrent(authority)) this.mutationNeedsReconcile = false;
    },
    syncState() {
      if (!this.lifecycle.beginOperation()) return;
      this.setData({
        items: this.pageState.pagination.items.map((value) => ({ ...value, claimed: true })),
        firstLoading: this.pageState.view.firstLoading, firstError: this.pageState.view.firstError,
        empty: this.pageState.view.empty, paginationStatus: this.pageState.view.paginationStatus,
        mutating: this.pageState.mutation !== null,
      });
    },
    onRetry() { void this.load("retry"); },
    onLoadMore() { void this.load("loadMore"); },
    onMaterialSelect(event: { detail: { claimId?: string } }) {
      if (event.detail.claimId) {
        this.navigateWithFeedback(dependencies.navigateToOwnedMaterialDetail(event.detail.claimId));
      }
    },
    onConfirmRemove(event: { currentTarget: { dataset: { claimid?: string } } }) {
      const claimId = event.currentTarget.dataset.claimid;
      if (!claimId) return;
      this.showMutationConfirmation({ type: "remove", claimId }, {
        title: "移出我的资料",
        content: "移出后将不能继续查看这份正文，可从资料中心重新领取当前版本。",
        confirmText: "移出", cancelText: "取消",
      });
    },
    onConfirmClear() {
      if (this.pageState.pagination.items.length === 0) return;
      this.showMutationConfirmation({ type: "clear" }, {
        title: "清空全部资料",
        content: "将一次移出当前全部资料，之后可在资料中心重新领取。此操作不等同于删除个人信息。",
        confirmText: "清空", cancelText: "取消",
      });
    },
    showMutationConfirmation(
      command: OwnedMutationCommand,
      copy: Pick<ModalOptions, "title" | "content" | "confirmText" | "cancelText">,
    ) {
      if (this.pageState.mutation || this.activeConfirmation) return;
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      const token = { sequence: this.confirmationSequence + 1, command };
      this.confirmationSequence = token.sequence;
      this.activeConfirmation = token;
      const release = () => {
        if (this.activeConfirmation !== token) return false;
        this.activeConfirmation = null;
        return true;
      };
      try {
        dependencies.showModal({
          ...copy,
          success: (result) => {
            if (!release() || !result.confirm || !this.lifecycle.isCurrent(authority)) return;
            void this.executeMutation(token.command);
          },
          fail: release,
          complete: release,
        });
      } catch {
        release();
      }
    },
    async executeMutation(command: OwnedMutationCommand) {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      const pending = beginOwnedMutation(this.pageState, command);
      if (!pending) return;
      this.pageState = pending.state;
      this.syncState();
      let mutationFlight: Promise<unknown>;
      try {
        if (command.type === "remove") {
          mutationFlight = dependencies.removeOwnedMaterial(
            dependencies.getApp().api,
            command.claimId,
          );
        } else {
          mutationFlight = dependencies.clearOwnedMaterials(dependencies.getApp().api);
        }
      } catch (error) {
        mutationFlight = Promise.reject(error);
      }
      const settlement = mutationFlight.then(
        () => undefined,
        () => undefined,
      );
      this.mutationSettlement = settlement;
      this.mutationNeedsReconcile = true;
      try {
        await mutationFlight;
        if (!this.lifecycle.isCurrent(authority)) return;
        const resolved = resolveOwnedMutation(this.pageState, pending.request);
        this.pageState = resolved.state;
        this.syncState();
        if (resolved.shouldReload) await this.load("refresh");
        if (this.lifecycle.isCurrent(authority)) {
          this.mutationNeedsReconcile = false;
          dependencies.showToast({ title: command.type === "clear" ? "已清空" : "已移出", icon: "none" });
        }
      } catch {
        this.handleMutationFailure(pending.request, authority);
        if (this.lifecycle.isCurrent(authority)) this.mutationNeedsReconcile = false;
      } finally {
        if (this.mutationSettlement === settlement) this.mutationSettlement = null;
      }
    },
    handleMutationFailure(request: OwnedMutationRequest, authority: MaterialOperationAuthority) {
      if (!this.lifecycle.isCurrent(authority)) return;
      this.pageState = failOwnedMutation(this.pageState, request);
      this.syncState();
      if (this.lifecycle.isCurrent(authority)) {
        dependencies.showToast({ title: "操作失败，请稍后重试", icon: "none" });
      }
    },
    onBrowseMaterials() {
      this.navigateWithFeedback(dependencies.navigateToPage("pages/materials/index"));
    },
    navigateWithFeedback(promise: Promise<void>) {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      void promise.catch(() => {
        if (this.lifecycle.isCurrent(authority)) {
          dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
        }
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
