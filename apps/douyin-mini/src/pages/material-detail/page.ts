import type { DouyinAppContext } from "../../app";
import type {
  claimMaterial,
  fetchMaterialPreview,
  fetchOwnedMaterialDetail,
  toMaterialBusinessError,
} from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import type { DouyinMaterialNoteBlock } from "../../models";
import type { copyTextToClipboard } from "../../platform/clipboard";
import type { navigateToPage, switchToTab } from "../../platform/navigation";
import { MaterialExperienceLifecycle, type MaterialOperationAuthority } from "../materials/page-model";
import {
  beginDetailLoad,
  beginMaterialClaim,
  createMaterialDetailState,
  failDetailLoad,
  failMaterialClaimUncertain,
  invalidateMaterialDetailState,
  isCurrentDetailRequest,
  resolveDetailBusinessError,
  resolveMaterialClaim,
  resolveMaterialPreview,
  resolveOwnedMaterial,
  serializeMaterialBlocks,
  type MaterialClaimRequest,
  type MaterialDetailRequest,
  type MaterialDetailState,
  type MaterialDetailTarget,
} from "./page-model";

export type MaterialDetailPageDependencies = {
  getApp(): DouyinAppContext;
  fetchMaterialPreview: typeof fetchMaterialPreview;
  fetchOwnedMaterialDetail: typeof fetchOwnedMaterialDetail;
  claimMaterial: typeof claimMaterial;
  toMaterialBusinessError: typeof toMaterialBusinessError;
  copyTextToClipboard: typeof copyTextToClipboard;
  navigateToPage: typeof navigateToPage;
  switchToTab: typeof switchToTab;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createMaterialDetailPageDefinition(
  dependencies: MaterialDetailPageDependencies,
) {
  return definePage({
    pageState: null as MaterialDetailState | null,
    target: null as MaterialDetailTarget | null,
    claimSettlement: null as Promise<void> | null,
    lifecycle: new MaterialExperienceLifecycle(),
    data: {
      status: "loading",
      preview: null as MaterialDetailState["preview"],
      content: null as MaterialDetailState["content"],
      displayTitle: "",
      displaySummary: "",
      displayCategory: "装修资料",
      displayApplicableTo: "",
      blocks: [] as Array<Record<string, unknown>>,
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
    },
    onLoad(query: { id?: string; claimId?: string }) {
      this.lifecycle.onLoad();
      const hasId = typeof query.id === "string" && query.id.length > 0;
      const hasClaimId = typeof query.claimId === "string" && query.claimId.length > 0;
      if (hasId === hasClaimId) {
        this.setData({ status: "not-found" });
        return;
      }
      this.target = hasId
        ? { kind: "preview", id: query.id! }
        : { kind: "owned", claimId: query.claimId! };
      this.pageState = createMaterialDetailState(this.target);
    },
    onShow() {
      this.lifecycle.onShow();
      if (this.pageState) void this.load();
    },
    onHide() {
      this.lifecycle.onHide();
      if (this.pageState) this.pageState = invalidateMaterialDetailState(this.pageState);
    },
    onUnload() {
      this.lifecycle.onUnload();
      if (this.pageState) this.pageState = invalidateMaterialDetailState(this.pageState);
    },
    async load() {
      if (!this.pageState || !this.target) return;
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      const pendingClaimSettlement = this.claimSettlement;
      if (pendingClaimSettlement) {
        await pendingClaimSettlement;
        if (!this.lifecycle.isCurrent(operation)) return;
      }
      const pending = beginDetailLoad(this.pageState);
      this.pageState = pending.state;
      this.syncState();
      try {
        const app = dependencies.getApp();
        const bootstrap = await app.bootstrap.getReadyOrLoad();
        if (!bootstrap || !this.isCurrentDetailOperation(operation, pending.request)) return;
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        this.setData({
          primaryColor: theme.primaryColor,
          primaryTextColor: theme.primaryTextColor,
        });
        if (this.target.kind === "owned") {
          const detail = await dependencies.fetchOwnedMaterialDetail(
            app.api,
            this.target.claimId,
          );
          if (!this.isCurrentDetailOperation(operation, pending.request)) return;
          const resolved = resolveOwnedMaterial(this.pageState!, pending.request, detail);
          if (resolved === this.pageState) return;
          this.pageState = resolved;
          this.syncState();
          return;
        }
        const preview = await dependencies.fetchMaterialPreview(app.api, this.target.id);
        if (!this.isCurrentDetailOperation(operation, pending.request)) return;
        const resolved = resolveMaterialPreview(this.pageState!, pending.request, preview);
        if (resolved === this.pageState) return;
        this.pageState = resolved;
        app.recordAnalytics("material_preview", preview.id);
        this.syncState();
        if (this.pageState.shouldAutoResolveClaim) await this.executeClaim();
      } catch (error) {
        this.handleLoadError(operation, pending.request, error);
      }
    },
    isCurrentDetailOperation(
      operation: MaterialOperationAuthority,
      request: MaterialDetailRequest,
    ) {
      return this.lifecycle.isCurrent(operation)
        && this.pageState !== null
        && isCurrentDetailRequest(this.pageState, request);
    },
    handleLoadError(
      operation: MaterialOperationAuthority,
      request: MaterialDetailRequest,
      error: unknown,
    ) {
      if (!this.lifecycle.isCurrent(operation) || !this.pageState) return;
      const businessError = dependencies.toMaterialBusinessError(error);
      const resolved = businessError
        ? resolveDetailBusinessError(
          this.pageState,
          businessError,
          { kind: "detail", request },
        )
        : failDetailLoad(this.pageState, request);
      if (resolved === this.pageState) return;
      this.pageState = resolved;
      this.syncState();
    },
    onClaim() { void this.executeClaim(); },
    async executeClaim() {
      if (!this.pageState || this.target?.kind !== "preview") return;
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      const pending = beginMaterialClaim(this.pageState);
      if (!pending) return;
      this.pageState = pending.state;
      this.syncState();
      let claimFlight: ReturnType<MaterialDetailPageDependencies["claimMaterial"]>;
      try {
        claimFlight = dependencies.claimMaterial(
          dependencies.getApp().api,
          this.target.id,
        );
      } catch (error) {
        claimFlight = Promise.reject(error);
      }
      const settlement = claimFlight.then(
        () => undefined,
        () => undefined,
      );
      this.claimSettlement = settlement;
      try {
        const result = await claimFlight;
        if (!this.lifecycle.isCurrent(operation) || !this.pageState) return;
        const resolved = resolveMaterialClaim(this.pageState, pending.request, result);
        if (resolved === this.pageState) return;
        this.pageState = resolved;
        this.syncState();
        dependencies.showToast({ title: "已加入我的资料", icon: "none" });
      } catch (error) {
        await this.recoverClaim(operation, pending.request, error);
      } finally {
        if (this.claimSettlement === settlement) this.claimSettlement = null;
      }
    },
    async recoverClaim(
      operation: MaterialOperationAuthority,
      request: MaterialClaimRequest,
      error: unknown,
    ) {
      if (!this.lifecycle.isCurrent(operation) || !this.pageState) return;
      const businessError = dependencies.toMaterialBusinessError(error);
      if (businessError) {
        const resolved = resolveDetailBusinessError(
          this.pageState,
          businessError,
          { kind: "claim", request },
        );
        if (resolved === this.pageState) return;
        this.pageState = resolved;
        this.syncState();
        return;
      }
      const uncertain = failMaterialClaimUncertain(this.pageState, request);
      if (uncertain === this.pageState) return;
      this.pageState = uncertain;
      this.syncState();
      await this.load();
    },
    syncState() {
      if (!this.pageState || !this.lifecycle.beginOperation()) return;
      const display = this.pageState.content ?? this.pageState.preview;
      this.setData({
        status: this.pageState.status,
        preview: this.pageState.preview,
        content: this.pageState.content,
        displayTitle: display?.title ?? "",
        displaySummary: display?.summary ?? "",
        displayCategory: display?.category ?? "装修资料",
        displayApplicableTo: display?.applicable_to ?? "",
        blocks: projectMaterialBlocks(this.pageState.content?.content_blocks ?? []),
      });
    },
    async onCopy() {
      if (!this.pageState?.content) return;
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      const content = this.pageState.content;
      try {
        await dependencies.copyTextToClipboard(
          serializeMaterialBlocks(content.content_blocks),
        );
        if (!this.lifecycle.isCurrent(operation)) return;
        dependencies.getApp().recordAnalytics("material_copy", content.id);
        dependencies.showToast({ title: "全文已复制", icon: "none" });
      } catch {
        if (!this.lifecycle.isCurrent(operation)) return;
        dependencies.showToast({ title: "复制失败，请稍后重试", icon: "none" });
      }
    },
    onBudget() {
      if (!this.pageState?.content) return;
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      dependencies.getApp().recordAnalytics(
        "material_budget_click",
        this.pageState.content.id,
      );
      this.navigateWithFeedback(operation, dependencies.switchToTab("budget"));
    },
    onLead() {
      if (!this.pageState?.content) return;
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      dependencies.getApp().recordAnalytics(
        "material_lead_click",
        this.pageState.content.id,
      );
      this.navigateWithFeedback(operation, dependencies.switchToTab("lead"));
    },
    onBackToMaterials() {
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      this.navigateWithFeedback(
        operation,
        dependencies.navigateToPage("pages/materials/index"),
      );
    },
    onOpenMine() {
      const operation = this.lifecycle.beginOperation();
      if (!operation) return;
      this.navigateWithFeedback(
        operation,
        dependencies.navigateToPage("pages/my-materials/index"),
      );
    },
    navigateWithFeedback(
      operation: MaterialOperationAuthority,
      promise: Promise<void>,
    ) {
      void promise.catch(() => {
        if (!this.lifecycle.isCurrent(operation)) return;
        dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
      });
    },
  });
}

function projectMaterialBlocks(
  blocks: readonly DouyinMaterialNoteBlock[],
): Array<Record<string, unknown>> {
  return blocks.map((block, blockIndex) => {
    const key = `${blockIndex}-${block.type}`;
    if (block.type !== "list") return { ...block, key };
    return {
      ...block,
      key,
      items: block.items.map((text, itemIndex) => ({
        key: `${key}-${itemIndex}`,
        marker: block.style === "ordered" ? `${itemIndex + 1}.` : "•",
        text,
      })),
    };
  });
}

function definePage<
  TData extends Record<string, unknown>,
  TCustom extends Record<string, unknown>,
>(options: TCustom & { data: TData } & ThisType<
  TCustom & { data: TData; setData(patch: Partial<TData>): void }
>): TCustom & { data: TData } {
  return options;
}
