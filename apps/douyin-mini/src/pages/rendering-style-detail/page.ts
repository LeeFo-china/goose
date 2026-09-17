import type { DouyinAppContext } from "../../app";
import { type PublishedRenderingStyle, type fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { normalizeMaterialUuid } from "../../api/material-uuid";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS } from "../rendering-styles/labels";

export type RenderingStyleDetailDependencies = {
  getApp(): DouyinAppContext;
  fetchPublishedStyleDetail: typeof fetchPublishedStyleDetail;
  navigateToList(): Promise<void>;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createRenderingStyleDetailPageDefinition(dependencies: RenderingStyleDetailDependencies) {
  return definePage({
    styleId: "",
    visible: false,
    wasHidden: false,
    requestEpoch: 0,
    data: {
      status: "loading" as "loading" | "ready" | "error" | "stale-error" | "not-found" | "blocked",
      style: null as PublishedRenderingStyle | null,
      spaceLabel: "",
      styleLabel: "",
      sourceLabel: "",
      publishedDate: "",
      imageFailed: false,
      errorTitle: "装修效果图加载失败",
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
    },
    onLoad(query: { id?: string }) {
      this.styleId = normalizeMaterialUuid(query.id) ?? "";
      this.visible = true;
      if (!this.styleId) {
        this.setData({ status: "not-found" });
        return;
      }
      void this.load();
    },
    onShow() {
      if (!this.wasHidden) return;
      this.wasHidden = false;
      this.visible = true;
      this.requestEpoch++;
      if (this.styleId) void this.load();
    },
    onHide() { this.wasHidden = true; this.visible = false; this.requestEpoch++; },
    onUnload() { this.wasHidden = false; this.visible = false; this.requestEpoch++; },
    async load() {
      if (!this.visible || !this.styleId) return;
      const epoch = ++this.requestEpoch;
      if (!this.data.style) this.setData({ status: "loading" });
      try {
        const app = dependencies.getApp();
        const bootstrap = await app.startup;
        if (!this.visible || epoch !== this.requestEpoch || !bootstrap) return;
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        const style = await dependencies.fetchPublishedStyleDetail(app.api, this.styleId);
        if (!this.visible || epoch !== this.requestEpoch) return;
        this.setData({
          status: "ready", style,
          spaceLabel: SPACE_LABELS[style.space],
          styleLabel: STYLE_LABELS[style.style],
          sourceLabel: SOURCE_LABELS[style.source_type],
          publishedDate: style.published_at.slice(0, 10),
          imageFailed: false,
          primaryColor: theme.primaryColor,
          primaryTextColor: theme.primaryTextColor,
        });
        app.recordAnalytics("page_view");
      } catch (error) {
        if (!this.visible || epoch !== this.requestEpoch) return;
        if (error instanceof ApiRequestError) {
          if (error.statusCode === 404 && error.code === "RENDERING_STYLE_NOT_FOUND") {
            this.setData({ status: "not-found", style: null });
            return;
          }
          if (error.code === "DOUYIN_INSTALLATION_DISABLED"
            || error.code === "TENANT_NOT_AVAILABLE") {
            this.setData({ status: "blocked", style: null });
            return;
          }
          if (error.statusCode === 401) {
            this.setData({ status: "error", style: null, errorTitle: "登录状态已失效" });
            return;
          }
        }
        this.setData({
          status: this.data.style ? "stale-error" : "error",
          errorTitle: "装修效果图加载失败",
        });
      }
    },
    onImageError() { this.setData({ imageFailed: true }); },
    onRetry() { void this.load(); },
    onBackToList() {
      void dependencies.navigateToList().catch(() => {
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
