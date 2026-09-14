import type { DouyinAppContext } from "../../app";
import { type PublishedRenderingStyle, type fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { normalizeMaterialUuid } from "../../api/material-uuid";
import { ApiRequestError } from "../../api/request";
import {
  type RenderingUploadPurpose,
  type createRenderingUploadIntent,
  type completeRenderingUploadWithRetry,
  type putRenderingBytes,
} from "../../api/rendering-uploads";
import { resolveThemeColor } from "../../components/theme";
import { type choosePrivateImage } from "../../platform/private-image";
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS } from "../rendering-styles/labels";

type UploadRecovery = {
  ids: Partial<Record<RenderingUploadPurpose, string>>;
  puts: Partial<Record<RenderingUploadPurpose, Promise<void>>>;
  files: Partial<Record<RenderingUploadPurpose, string>>;
};

// Intent IDs have no signed URL or image bytes. Keep them only for the lifetime of this app API session.
const recoveries = new WeakMap<DouyinAppContext["api"], Map<string, UploadRecovery>>();

function recoveryFor(api: DouyinAppContext["api"], styleId: string): UploadRecovery {
  let styles = recoveries.get(api);
  if (!styles) { styles = new Map(); recoveries.set(api, styles); }
  let recovery = styles.get(styleId);
  if (!recovery) { recovery = { ids: {}, puts: {}, files: {} }; styles.set(styleId, recovery); }
  return recovery;
}

export type RenderingStyleDetailDependencies = {
  getApp(): DouyinAppContext;
  fetchPublishedStyleDetail: typeof fetchPublishedStyleDetail;
  choosePrivateImage: typeof choosePrivateImage;
  createRenderingUploadIntent: typeof createRenderingUploadIntent;
  putRenderingBytes: typeof putRenderingBytes;
  completeRenderingUploadWithRetry: typeof completeRenderingUploadWithRetry;
  navigateToList(): Promise<void>;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createRenderingStyleDetailPageDefinition(dependencies: RenderingStyleDetailDependencies) {
  return definePage({
    styleId: "",
    visible: false,
    wasHidden: false,
    requestEpoch: 0,
    uploadEpoch: 0,
    uploading: false,
    selectingImage: false,
    resumeUpload: undefined as (() => void) | undefined,
    pendingIntent: {} as Partial<Record<RenderingUploadPurpose, string>>,
    recovery: { ids: {}, puts: {}, files: {} } as UploadRecovery,
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
      roomFileId: "",
      floorFileId: "",
      roomUploadStatus: "idle" as UploadStatus,
      floorUploadStatus: "idle" as UploadStatus,
      roomUploadMessage: "房间照为必传，最多 10 MiB",
      floorUploadMessage: "户型图可选，最多 10 MiB",
    },
    onLoad(query: { id?: string }) {
      this.styleId = normalizeMaterialUuid(query.id) ?? "";
      this.visible = true;
      this.uploading = false;
      if (!this.styleId) {
        this.setData({ status: "not-found" });
        return;
      }
      this.recovery = recoveryFor(dependencies.getApp().api, this.styleId);
      this.pendingIntent = this.recovery.ids;
      if (this.recovery.files.room) {
        this.setData({ roomFileId: this.recovery.files.room });
        this.setUploadState("room", "pending_review", "已上传，待审核；当前不能用于 AI 生成");
      }
      if (this.recovery.files.floor_plan) {
        this.setData({ floorFileId: this.recovery.files.floor_plan });
        this.setUploadState("floor_plan", "pending_review", "已上传，待审核；当前不能用于 AI 生成");
      }
      if (this.pendingIntent.room) this.setUploadState("room", "retry_complete", "可继续确认当前房间照");
      if (this.pendingIntent.floor_plan) this.setUploadState("floor_plan", "retry_complete", "可继续确认当前户型图");
      void this.load();
    },
    onShow() {
      if (!this.wasHidden) return;
      this.wasHidden = false;
      this.visible = true;
      this.requestEpoch++;
      this.resumeUpload?.();
      this.resumeUpload = undefined;
      if (this.styleId) void this.load();
    },
    onHide() {
      this.wasHidden = true; this.visible = false; this.requestEpoch++;
      // The native photo picker may hide this page before returning its selection.
      if (this.selectingImage) return;
      this.uploadEpoch++; this.uploading = false;
      if (this.pendingIntent.room) this.setUploadState("room", "retry_complete", "可继续确认当前房间照");
      else if (this.data.roomUploadStatus !== "pending_review") this.setUploadState("room", "idle", "房间照为必传，最多 10 MiB");
      if (this.pendingIntent.floor_plan) this.setUploadState("floor_plan", "retry_complete", "可继续确认当前户型图");
      else if (this.data.floorUploadStatus !== "pending_review") this.setUploadState("floor_plan", "idle", "户型图可选，最多 10 MiB");
    },
    onUnload() {
      this.wasHidden = false; this.visible = false; this.requestEpoch++;
      this.uploadEpoch++; this.uploading = false; this.selectingImage = false;
      this.resumeUpload?.();
      this.resumeUpload = undefined;
    },
    async waitForUploadVisibility() {
      if (!this.visible) await new Promise<void>((resolve) => { this.resumeUpload = resolve; });
    },
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
    onChooseRoom() { void this.upload("room"); },
    onChooseFloorPlan() { void this.upload("floor_plan"); },
    onRetryRoomComplete() { void this.retryComplete("room"); },
    onRetryFloorComplete() { void this.retryComplete("floor_plan"); },
    async upload(purpose: RenderingUploadPurpose) {
      if (!this.visible || this.data.status !== "ready") return;
      if (purpose === "floor_plan" && !this.data.roomFileId) {
        this.setUploadState("floor_plan", "idle", "请先上传房间照，再选择户型图");
        dependencies.showToast({ title: "请先上传房间照", icon: "none" });
        return;
      }
      if (this.uploading) return;
      if (purpose === "room" ? this.data.roomFileId : this.data.floorFileId) return;
      if (this.pendingIntent[purpose]) {
        await this.retryComplete(purpose);
        return;
      }
      const epoch = this.uploadEpoch;
      const active = () => this.visible && epoch === this.uploadEpoch;
      this.uploading = true;
      let putUncertain = false;
      this.setUploadState(purpose, "selecting", "正在选择图片…");
      try {
        const app = dependencies.getApp();
        const bootstrap = await app.startup;
        if (!active()) return;
        if (!bootstrap) throw new ApiRequestError(401, "SESSION_UNAVAILABLE", "登录状态已失效");
        this.selectingImage = true;
        const image = await dependencies.choosePrivateImage();
        this.selectingImage = false;
        if (epoch !== this.uploadEpoch) return;
        await this.waitForUploadVisibility();
        if (!active()) return;
        this.setUploadState(purpose, "signing", "正在准备私有上传…");
        const intent = await dependencies.createRenderingUploadIntent(app.api, {
          purpose, mimeType: image.mimeType, sizeBytes: image.sizeBytes,
        });
        if (!active()) return;
        this.pendingIntent[purpose] = intent.intentId;
        if (Date.parse(intent.expiresAt) <= Date.now()) {
          throw new ApiRequestError(409, "RENDERING_UPLOAD_EXPIRED", "上传凭据已过期");
        }
        this.setUploadState(purpose, "uploading", "正在上传原始图片…");
        const put = dependencies.putRenderingBytes({
          uploadUrl: intent.uploadUrl, headers: intent.headers, bytes: image.bytes,
        });
        this.recovery.puts[purpose] = put;
        try {
          await put;
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.code !== "COS_PUT_UNCERTAIN") throw error;
          putUncertain = true;
        } finally {
          if (this.recovery.puts[purpose] === put) this.recovery.puts[purpose] = undefined;
        }
        if (!active()) return;
        await this.confirm(purpose, app.api, intent.intentId, active);
      } catch (error) {
        this.selectingImage = false;
        if (epoch === this.uploadEpoch) await this.waitForUploadVisibility();
        if (active()) this.handleUploadError(purpose,
          putUncertain && error instanceof ApiRequestError && error.statusCode === 422
            ? new ApiRequestError(422, "COS_UPLOAD_NOT_CONFIRMED", "上传未完成") : error);
      } finally {
        if (active()) this.uploading = false;
      }
    },
    async retryComplete(purpose: RenderingUploadPurpose) {
      const intentId = this.pendingIntent[purpose];
      if (!this.visible || this.data.status !== "ready" || this.uploading || !intentId) return;
      const epoch = this.uploadEpoch;
      const active = () => this.visible && epoch === this.uploadEpoch;
      this.uploading = true;
      try {
        const app = dependencies.getApp();
        const bootstrap = await app.startup;
        if (!active()) return;
        if (!bootstrap) throw new ApiRequestError(401, "SESSION_UNAVAILABLE", "登录状态已失效");
        const put = this.recovery.puts[purpose];
        if (put) {
          this.setUploadState(purpose, "uploading", "正在等待当前图片上传完成…");
          try { await put; }
          catch (error) {
            if (!(error instanceof ApiRequestError) || error.code !== "COS_PUT_UNCERTAIN") throw error;
          }
          if (!active()) return;
        }
        await this.confirm(purpose, app.api, intentId, active);
      } catch (error) {
        if (active()) this.handleUploadError(purpose, error);
      } finally {
        if (active()) this.uploading = false;
      }
    },
    async confirm(purpose: RenderingUploadPurpose, api: DouyinAppContext["api"], id: string,
      active: () => boolean) {
      this.setUploadState(purpose, "confirming", "正在确认私有文件…");
      const result = await dependencies.completeRenderingUploadWithRetry(api, id);
      if (!active()) return;
      this.pendingIntent[purpose] = undefined;
      this.recovery.files[purpose] = result.fileId;
      if (purpose === "room") this.setData({ roomFileId: result.fileId });
      else this.setData({ floorFileId: result.fileId });
      this.setUploadState(purpose, "pending_review", "已上传，待审核；当前不能用于 AI 生成");
    },
    setUploadState(purpose: RenderingUploadPurpose, status: UploadStatus, message: string) {
      if (purpose === "room") this.setData({ roomUploadStatus: status, roomUploadMessage: message });
      else this.setData({ floorUploadStatus: status, floorUploadMessage: message });
    },
    handleUploadError(purpose: RenderingUploadPurpose, error: unknown) {
      if (error instanceof ApiRequestError && error.code === "IMAGE_SELECTION_CANCELLED") {
        this.setUploadState(purpose, "idle", purpose === "room" ? "房间照为必传，最多 10 MiB" : "户型图可选，最多 10 MiB");
        return;
      }
      if (error instanceof ApiRequestError && (error.statusCode === 422
        || error.statusCode === 401 || error.code === "RENDERING_UPLOAD_EXPIRED"
        || error.code === "COS_PUT_REJECTED" || error.code === "RENDERING_INPUT_NOT_FOUND"
        || error.code === "RENDERING_INPUT_STATE_CONFLICT")) {
        this.pendingIntent[purpose] = undefined;
      }
      const retryable = Boolean(this.pendingIntent[purpose]);
      this.setUploadState(purpose, retryable ? "retry_complete" : "error", uploadErrorMessage(error, retryable));
    },
    onBackToList() {
      void dependencies.navigateToList().catch(() => {
        dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
      });
    },
  });
}

type UploadStatus = "idle" | "selecting" | "signing" | "uploading" | "confirming"
  | "pending_review" | "retry_complete" | "error";

function uploadErrorMessage(error: unknown, retryable: boolean): string {
  if (!(error instanceof ApiRequestError)) return retryable
    ? "上传结果暂无法确认，可继续确认当前文件" : "上传失败，请重新选择或稍后重试";
  if (error.statusCode === 401) return "登录状态已失效，请重新进入后重试";
  if (error.code === "RENDERING_TENANT_CONTEXT_REQUIRED") return "请先选择装修公司后重试";
  if (error.code === "DOUYIN_INSTALLATION_DISABLED" || error.code === "TENANT_NOT_AVAILABLE") {
    return "装修公司服务暂不可用";
  }
  if (error.code === "RENDERING_IMAGE_REJECTED") return "图片不合格，请重新选择静态图片";
  if (error.code === "COS_UPLOAD_NOT_CONFIRMED") return "上传未完成，请重新选择图片";
  if (error.code === "RENDERING_UPLOAD_PROCESSING") return "图片仍在处理，请继续确认当前上传";
  if (error.code === "RENDERING_UPLOAD_EXPIRED") return "上传凭据已过期，请重新选择图片";
  if (error.code === "RENDERING_INPUT_NOT_FOUND" || error.code === "RENDERING_INPUT_STATE_CONFLICT") {
    return "当前上传已不可确认，请重新选择图片";
  }
  if (error.code === "RENDERING_UPLOAD_RATE_LIMITED") return "上传次数较多，请稍后重试";
  if (error.code === "IMAGE_PRIVACY_SCOPE_UNDECLARED") return "图片选择暂不可用，请稍后重试";
  if (error.code === "IMAGE_PRIVACY_NOT_AUTHORIZED") return "请先同意小程序隐私协议，再选择照片";
  if (error.code === "IMAGE_SELECTION_FAILED") return "无法选择照片，请检查图片权限后重试";
  if (error.code === "UNSUPPORTED_PRIVATE_IMAGE" || error.code === "INVALID_IMAGE_SIZE") return error.message;
  if (error.code === "COS_PUT_REJECTED") return "上传请求被拒绝，请检查网络后重新选择";
  return retryable ? "上传结果暂无法确认，可继续确认当前文件" : "上传失败，请重新选择或稍后重试";
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}
