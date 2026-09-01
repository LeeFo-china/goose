import type { DouyinAppContext } from "../../app";
import {
  claimMaterial,
  fetchMaterialPreview,
  fetchOwnedMaterialDetail,
  toMaterialBusinessError,
} from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import { copyTextToClipboard } from "../../platform/clipboard";
import { navigateToPage, switchToTab } from "../../platform/navigation";
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

Page({
  pageState: null as MaterialDetailState | null,
  target: null as MaterialDetailTarget | null,
  visible: false,
  data: {
    status: "loading",
    preview: null as MaterialDetailState["preview"],
    content: null as MaterialDetailState["content"],
    blocks: [] as Array<Record<string, unknown>>,
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
  },
  onLoad(query: { id?: string; claimId?: string }) {
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
    this.visible = true;
    if (this.pageState) void this.load();
  },
  onHide() {
    if (this.pageState) {
      this.pageState = invalidateMaterialDetailState(this.pageState);
      this.syncState();
    }
    this.visible = false;
  },
  onUnload() {
    this.visible = false;
    if (this.pageState) this.pageState = invalidateMaterialDetailState(this.pageState);
  },
  async load() {
    if (!this.visible || !this.pageState || !this.target) return;
    const pending = beginDetailLoad(this.pageState);
    this.pageState = pending.state;
    this.syncState();
    try {
      const app = getApp<DouyinAppContext>();
      const bootstrap = await app.bootstrap.getReadyOrLoad();
      if (!bootstrap || !this.visible
        || !isCurrentDetailRequest(this.pageState, pending.request)) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      this.setData({
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
      });
      if (this.target.kind === "owned") {
        const detail = await fetchOwnedMaterialDetail(app.api, this.target.claimId);
        const resolved = resolveOwnedMaterial(this.pageState, pending.request, detail);
        if (resolved === this.pageState) return;
        this.pageState = resolved;
        this.syncState();
        return;
      }
      const preview = await fetchMaterialPreview(app.api, this.target.id);
      const resolved = resolveMaterialPreview(this.pageState, pending.request, preview);
      if (resolved === this.pageState) return;
      this.pageState = resolved;
      app.recordAnalytics("material_preview", preview.id);
      this.syncState();
      if (this.pageState.shouldAutoResolveClaim) await this.executeClaim();
    } catch (error) {
      this.handleLoadError(pending.request, error);
    }
  },
  handleLoadError(request: MaterialDetailRequest, error: unknown) {
    if (!this.pageState) return;
    const businessError = toMaterialBusinessError(error);
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
    if (!this.visible || !this.pageState || this.target?.kind !== "preview") return;
    const pending = beginMaterialClaim(this.pageState);
    if (!pending) return;
    this.pageState = pending.state;
    this.syncState();
    try {
      const result = await claimMaterial(
        getApp<DouyinAppContext>().api,
        this.target.id,
      );
      const resolved = resolveMaterialClaim(this.pageState, pending.request, result);
      if (resolved === this.pageState) return;
      this.pageState = resolved;
      this.syncState();
      void tt.showToast({ title: "已加入我的资料", icon: "none" });
    } catch (error) {
      await this.recoverClaim(pending.request, error);
    }
  },
  async recoverClaim(request: MaterialClaimRequest, error: unknown) {
    if (!this.pageState) return;
    const businessError = toMaterialBusinessError(error);
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
    if (!this.pageState || !this.visible) return;
    this.setData({
      status: this.pageState.status,
      preview: this.pageState.preview,
      content: this.pageState.content,
      blocks: (this.pageState.content?.content_blocks ?? []).map((block, index) => ({
        ...block,
        key: `${index}-${block.type}`,
      })),
    });
  },
  async onCopy() {
    if (!this.visible || !this.pageState?.content) return;
    const content = this.pageState.content;
    try {
      await copyTextToClipboard(
        serializeMaterialBlocks(content.content_blocks),
      );
      if (!this.visible || this.pageState?.content?.id !== content.id) return;
      getApp<DouyinAppContext>().recordAnalytics(
        "material_copy",
        content.id,
      );
      void tt.showToast({ title: "全文已复制", icon: "none" });
    } catch {
      if (this.visible) {
        void tt.showToast({ title: "复制失败，请稍后重试", icon: "none" });
      }
    }
  },
  onBudget() {
    if (!this.pageState?.content) return;
    getApp<DouyinAppContext>().recordAnalytics(
      "material_budget_click",
      this.pageState.content.id,
    );
    navigateWithFeedback(switchToTab("budget"));
  },
  onLead() {
    if (!this.pageState?.content) return;
    getApp<DouyinAppContext>().recordAnalytics(
      "material_lead_click",
      this.pageState.content.id,
    );
    navigateWithFeedback(switchToTab("lead"));
  },
  onBackToMaterials() {
    navigateWithFeedback(navigateToPage("pages/materials/index"));
  },
  onOpenMine() {
    navigateWithFeedback(navigateToPage("pages/my-materials/index"));
  },
});

function navigateWithFeedback(promise: Promise<void>): void {
  void promise.catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
}
