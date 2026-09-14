import type { DouyinAppContext } from "../../app";
import { type PublishedRenderingStyle, type fetchPublishedStyleDetail } from "../../api/rendering-styles";
import { normalizeMaterialUuid } from "../../api/material-uuid";
import { ApiRequestError } from "../../api/request";
import { type RenderingJobRequest, type RenderingJobStatus, type createRenderingJob,
  type fetchRenderingJobStatus } from "../../api/rendering-jobs";
import {
  type RenderingUploadPurpose,
  type createRenderingUploadIntent,
  type completeRenderingUploadWithRetry,
  type fetchRenderingUploadStatus,
  type fetchRenderingUploadPreview,
  type putRenderingBytes,
} from "../../api/rendering-uploads";
import { resolveThemeColor } from "../../components/theme";
import { type choosePrivateImage } from "../../platform/private-image";
import { identityKey, type RenderingRecoveryIdentity, type RenderingRecoveryRecord, type clearRenderingRecovery,
  type readRenderingRecovery,
  type writeRenderingRecovery } from "../../platform/rendering-recovery";
import { createUuidV4IdempotencyKey } from "../../utils/idempotency";
import { SOURCE_LABELS, SPACE_LABELS, STYLE_LABELS } from "../rendering-styles/labels";

type UploadRecovery = {
  ids: Partial<Record<RenderingUploadPurpose, string>>;
  puts: Partial<Record<RenderingUploadPurpose, Promise<void>>>;
  files: Partial<Record<RenderingUploadPurpose, string>>;
  jobRequest?: RenderingJobRequest;
  jobId?: string;
};

// Intent IDs have no signed URL or image bytes. Keep them only for the lifetime of this app API session.
const recoveries = new WeakMap<DouyinAppContext["api"], Map<string, UploadRecovery>>();

function recoveryFor(api: DouyinAppContext["api"], scope: string, styleId: string): UploadRecovery {
  let styles = recoveries.get(api);
  if (!styles) { styles = new Map(); recoveries.set(api, styles); }
  const key = `${scope}_${styleId}`;
  let recovery = styles.get(key);
  if (!recovery) { recovery = { ids: {}, puts: {}, files: {} }; styles.set(key, recovery); }
  return recovery;
}

export type RenderingStyleDetailDependencies = {
  getApp(): DouyinAppContext;
  fetchPublishedStyleDetail: typeof fetchPublishedStyleDetail;
  choosePrivateImage: typeof choosePrivateImage;
  createRenderingUploadIntent: typeof createRenderingUploadIntent;
  putRenderingBytes: typeof putRenderingBytes;
  completeRenderingUploadWithRetry: typeof completeRenderingUploadWithRetry;
  fetchRenderingUploadStatus?: typeof fetchRenderingUploadStatus;
  fetchRenderingUploadPreview?: typeof fetchRenderingUploadPreview;
  previewImage?: (options: Parameters<typeof tt.previewImage>[0]) => void;
  createRenderingJob?: typeof createRenderingJob;
  fetchRenderingJobStatus?: typeof fetchRenderingJobStatus;
  readRenderingRecovery?: typeof readRenderingRecovery;
  writeRenderingRecovery?: typeof writeRenderingRecovery;
  clearRenderingRecovery?: typeof clearRenderingRecovery;
  resolveRecoveryIdentity?: (app: DouyinAppContext) => Promise<RenderingRecoveryIdentity | null>;
  createIdempotencyKey?: () => string;
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
    jobEpoch: 0,
    jobPolls: 0,
    jobTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    submittingJob: false,
    uploading: false,
    selectingImage: false,
    resumeUpload: undefined as (() => void) | undefined,
    pendingIntent: {} as Partial<Record<RenderingUploadPurpose, string>>,
    recovery: { ids: {}, puts: {}, files: {} } as UploadRecovery,
    recoveryIdentity: null as RenderingRecoveryIdentity | null,
    recoveryScope: null as string | null,
    scopeReady: false,
    hiddenDraft: null as { scope: string; mode: "soft_furnishing" | "renovation"; keepNotes: string } | null,
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
      mode: "soft_furnishing" as "soft_furnishing" | "renovation",
      keepNotes: "",
      canGenerate: false,
      showGeneration: false,
      generateButtonLabel: "生成 AI 参考效果图",
      jobId: "",
      jobStatus: "" as RenderingJobStatus | "",
      jobMessage: "",
      jobSubmitting: false,
      jobDraftLocked: false,
      resultUrl: "",
      resultImageFailed: false,
    },
    onLoad(query: { id?: string }) {
      this.styleId = normalizeMaterialUuid(query.id) ?? "";
      this.visible = true;
      this.uploading = false;
      if (!this.styleId) {
        this.setData({ status: "not-found" });
        return;
      }
      dependencies.clearRenderingRecovery?.(null, this.styleId);
      void this.load();
    },
    applyRecoveryScope(identity: RenderingRecoveryIdentity | null) {
      const scope = identityKey(identity);
      const sameScope = scope !== null && scope === this.recoveryScope;
      if (!sameScope) {
        this.jobEpoch++; this.stopJobPolling();
        this.uploadEpoch++; this.uploading = false;
        this.submittingJob = false;
        this.recovery = scope ? recoveryFor(dependencies.getApp().api, scope, this.styleId)
          : { ids: {}, puts: {}, files: {} };
        this.setData({ roomFileId: "", floorFileId: "", roomUploadStatus: "idle",
          floorUploadStatus: "idle", mode: "soft_furnishing", keepNotes: "", jobId: "",
          jobStatus: "", jobMessage: "", jobDraftLocked: false, jobSubmitting: false,
          resultUrl: "", resultImageFailed: false });
      }
      this.recoveryIdentity = scope ? identity : null;
      this.recoveryScope = scope;
      this.scopeReady = Boolean(scope);
      const stored = scope && identity ? dependencies.readRenderingRecovery?.(identity, this.styleId) : null;
      if (stored) {
        if (!this.recovery.ids.room && stored.roomIntentId) this.recovery.ids.room = stored.roomIntentId;
        if (!this.recovery.ids.floor_plan && stored.floorIntentId) this.recovery.ids.floor_plan = stored.floorIntentId;
        if (!this.recovery.files.room && stored.roomFileId) this.recovery.files.room = stored.roomFileId;
        if (!this.recovery.files.floor_plan && stored.floorFileId) this.recovery.files.floor_plan = stored.floorFileId;
        this.recovery.jobRequest ??= stored.jobRequest ?? undefined;
        this.recovery.jobId ??= stored.jobId ?? undefined;
      }
      this.pendingIntent = this.recovery.ids;
      if (this.recovery.files.room) {
        this.setData({ roomFileId: this.recovery.files.room });
        this.setUploadState("room", "checking", "正在确认图片状态…");
      }
      if (this.recovery.files.floor_plan) {
        this.setData({ floorFileId: this.recovery.files.floor_plan });
        this.setUploadState("floor_plan", "checking", "正在确认图片状态…");
      }
      if (this.pendingIntent.room) this.setUploadState("room", "retry_complete", "可继续确认当前房间照");
      if (this.pendingIntent.floor_plan) this.setUploadState("floor_plan", "retry_complete", "可继续确认当前户型图");
      if (this.recovery.jobRequest) this.setData({
        mode: this.recovery.jobRequest.mode,
        keepNotes: this.recovery.jobRequest.keep_notes ?? "",
        jobMessage: this.recovery.jobId ? "正在恢复生成任务…" : "上次提交结果未确认，可继续提交同一任务",
        jobId: this.recovery.jobId ?? "",
        jobDraftLocked: true,
      });
      else if (sameScope && this.hiddenDraft?.scope === scope) {
        this.setData({ mode: this.hiddenDraft.mode, keepNotes: this.hiddenDraft.keepNotes });
      }
      this.hiddenDraft = null;
      this.updateCanGenerate();
    },
    maskPrivateDisplay() {
      this.setData({ roomFileId: "", floorFileId: "", roomUploadStatus: "idle",
        floorUploadStatus: "idle", roomUploadMessage: "房间照为必传，最多 10 MiB",
        floorUploadMessage: "户型图可选，最多 10 MiB", mode: "soft_furnishing",
        keepNotes: "", canGenerate: false, showGeneration: false, jobId: "",
        jobStatus: "", jobMessage: "", jobSubmitting: false, jobDraftLocked: false,
        resultUrl: "", resultImageFailed: false });
    },
    onShow() {
      if (!this.wasHidden) return;
      this.wasHidden = false;
      this.visible = true;
      this.scopeReady = false;
      this.setData({ resultUrl: "" });
      this.requestEpoch++;
      if (this.styleId) void this.load();
    },
    onHide() {
      this.wasHidden = true; this.visible = false; this.requestEpoch++;
      this.hiddenDraft = this.recoveryScope ? { scope: this.recoveryScope,
        mode: this.data.mode, keepNotes: this.data.keepNotes } : null;
      this.scopeReady = false;
      this.submittingJob = false;
      this.jobEpoch++; this.stopJobPolling();
      // The native photo picker may hide this page before returning its selection.
      if (this.selectingImage) { this.maskPrivateDisplay(); return; }
      this.uploadEpoch++; this.uploading = false;
      if (this.pendingIntent.room) this.setUploadState("room", "retry_complete", "可继续确认当前房间照");
      else if (this.data.roomUploadStatus !== "checking") this.setUploadState("room", "idle", "房间照为必传，最多 10 MiB");
      if (this.pendingIntent.floor_plan) this.setUploadState("floor_plan", "retry_complete", "可继续确认当前户型图");
      else if (this.data.floorUploadStatus !== "checking") this.setUploadState("floor_plan", "idle", "户型图可选，最多 10 MiB");
      this.maskPrivateDisplay();
    },
    onUnload() {
      this.wasHidden = false; this.visible = false; this.requestEpoch++;
      this.jobEpoch++; this.stopJobPolling();
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
        if (!this.visible || epoch !== this.requestEpoch) return;
        if (!bootstrap) {
          this.resumeUpload?.(); this.resumeUpload = undefined;
          return;
        }
        const identity = await dependencies.resolveRecoveryIdentity?.(app) ?? null;
        if (!this.visible || epoch !== this.requestEpoch) return;
        this.applyRecoveryScope(identity);
        this.resumeUpload?.();
        this.resumeUpload = undefined;
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
        void this.refreshUploads();
        if (this.recovery.jobId) void this.refreshJob();
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
    onPreviewRoom() { void this.preview("room"); },
    onPreviewFloorPlan() { void this.preview("floor_plan"); },
    onRemoveRoom() { this.removeFromDraft("room"); },
    onRemoveFloorPlan() { this.removeFromDraft("floor_plan"); },
    onKeepRoom() { this.keepOriginal("room"); },
    onKeepFloorPlan() { this.keepOriginal("floor_plan"); },
    onRetryRoomComplete() { void this.retryComplete("room"); },
    onRetryFloorComplete() { void this.retryComplete("floor_plan"); },
    onCheckUploadStatus() { void this.refreshUploads(); },
    onRefreshJob() { void this.refreshJob(true); },
    onResultImageError() { this.setData({ resultImageFailed: true }); },
    onStartAgain() {
      if (this.data.jobStatus !== "failed" || !this.recovery.jobId) return;
      this.stopJobPolling();
      this.recovery.jobId = undefined;
      this.recovery.jobRequest = undefined;
      this.persistRecovery();
      this.setData({ jobId: "", jobStatus: "", jobMessage: "", resultUrl: "",
        resultImageFailed: false, jobDraftLocked: false });
      this.updateCanGenerate();
    },
    onSelectMode(event: { currentTarget: { dataset: { value?: string } } }) {
      if (this.recovery.jobRequest || this.submittingJob) return;
      const value = event.currentTarget.dataset.value;
      if (value !== "soft_furnishing" && value !== "renovation") return;
      this.setData({ mode: value });
      this.invalidateJobDraft();
    },
    onKeepNotesInput(event: { detail: { value?: string } }) {
      if (this.recovery.jobRequest || this.submittingJob) return;
      this.setData({ keepNotes: (event.detail.value ?? "").slice(0, 300) });
      this.invalidateJobDraft();
    },
    onGenerate() { void this.submitJob(); },
    async preview(purpose: RenderingUploadPurpose) {
      const fileId = this.recovery.files[purpose];
      if (!fileId || !this.visible || !this.scopeReady || !dependencies.fetchRenderingUploadPreview
        || !dependencies.previewImage) return;
      const scope = this.recoveryScope;
      const epoch = this.requestEpoch;
      let reported = false;
      const reportFailure = () => {
        if (reported || !this.visible || this.requestEpoch !== epoch || this.recoveryScope !== scope
          || this.recovery.files[purpose] !== fileId) return;
        reported = true;
        dependencies.showToast({ title: "暂无法查看图片，请稍后重试", icon: "none" });
      };
      try {
        const url = await dependencies.fetchRenderingUploadPreview(dependencies.getApp().api, fileId);
        if (!this.visible || !this.scopeReady || this.requestEpoch !== epoch || this.recoveryScope !== scope
          || this.recovery.files[purpose] !== fileId) return;
        dependencies.previewImage({ urls: [url], current: url, showmenu: false, fail: reportFailure });
      } catch {
        reportFailure();
      }
    },
    removeFromDraft(purpose: RenderingUploadPurpose) {
      if (!this.visible || !this.scopeReady || this.uploading || this.pendingIntent[purpose]
        || this.recovery.jobRequest || this.recovery.jobId || !this.recovery.files[purpose]) return;
      this.recovery.files[purpose] = undefined;
      if (purpose === "room") this.setData({ roomFileId: "" });
      else this.setData({ floorFileId: "" });
      this.setUploadState(purpose, "idle", purpose === "room" ? "请重新选择房间照" : "本次生成不使用户型图");
      this.persistRecovery();
    },
    keepOriginal(purpose: RenderingUploadPurpose) {
      if (!this.visible || !this.scopeReady || this.uploading || !this.recovery.files[purpose]
        || !this.pendingIntent[purpose] || this.recovery.jobRequest || this.recovery.jobId) return;
      this.pendingIntent[purpose] = undefined;
      this.persistRecovery();
      this.setUploadState(purpose, "ready", "原图已保留，可用于 AI 生成");
    },
    persistRecovery(): boolean {
      if (!this.scopeReady || !this.recoveryIdentity) return false;
      if (!dependencies.writeRenderingRecovery) return true;
      const record: RenderingRecoveryRecord = {
        styleId: this.styleId,
        roomIntentId: this.pendingIntent.room ?? null,
        floorIntentId: this.pendingIntent.floor_plan ?? null,
        roomFileId: this.recovery.files.room ?? null,
        floorFileId: this.recovery.files.floor_plan ?? null,
        jobRequest: this.recovery.jobRequest ?? null,
        jobId: this.recovery.jobId ?? null,
        savedAt: Date.now(),
      };
      return dependencies.writeRenderingRecovery(this.recoveryIdentity, record);
    },
    invalidateJobDraft() {
      // A submitted request may have reached the server despite a network error.
      // Its exact payload and key must remain immutable for safe retries.
      if (this.recovery.jobRequest) return;
      this.setData({ jobMessage: "" });
    },
    updateCanGenerate() {
      this.setData({
        canGenerate: this.scopeReady && !this.recovery.jobId && !this.submittingJob
          && (Boolean(this.recovery.jobRequest) || this.data.roomUploadStatus === "ready"
            && (!this.data.floorFileId || this.data.floorUploadStatus === "ready")),
        showGeneration: Boolean(this.data.roomFileId || this.recovery.jobRequest || this.recovery.jobId),
        generateButtonLabel: this.submittingJob ? "正在提交…"
          : this.recovery.jobRequest ? "继续确认生成任务" : "生成 AI 参考效果图",
      });
    },
    async refreshUploads() {
      if (!dependencies.fetchRenderingUploadStatus || !this.visible || this.data.status !== "ready") return;
      const epoch = this.requestEpoch;
      const app = dependencies.getApp();
      for (const purpose of ["room", "floor_plan"] as const) {
        const fileId = this.recovery.files[purpose];
        if (!fileId || this.pendingIntent[purpose] || ["selecting", "signing", "uploading", "confirming"].includes(
          purpose === "room" ? this.data.roomUploadStatus : this.data.floorUploadStatus)) continue;
        try {
          const progress = await dependencies.fetchRenderingUploadStatus(app.api, fileId);
          if (!this.visible || epoch !== this.requestEpoch) return;
          if (this.recovery.files[purpose] !== fileId) continue;
          if (this.pendingIntent[purpose] || ["selecting", "signing", "uploading", "confirming"].includes(
            purpose === "room" ? this.data.roomUploadStatus : this.data.floorUploadStatus)) continue;
          if (progress.status === "ready" || progress.status === "approved") {
            this.setUploadState(purpose, "ready", "图片已就绪，可用于 AI 生成");
          } else if (progress.status === "pending_review") {
            this.setUploadState(purpose, "checking", "图片状态正在同步，请稍后检查");
          } else if (progress.status === "rejected" || progress.status === "failed" || progress.status === "deleted") {
            this.recovery.files[purpose] = undefined;
            if (purpose === "room") this.setData({ roomFileId: "" });
            else this.setData({ floorFileId: "" });
            this.persistRecovery();
            this.setUploadState(purpose, "error", "图片不可用，请重新选择");
          } else {
            this.setUploadState(purpose, "checking", "图片仍在处理，请稍后检查状态");
          }
        } catch (error) {
          if (!this.visible || epoch !== this.requestEpoch) return;
          if (this.recovery.files[purpose] !== fileId || this.pendingIntent[purpose]
            || ["selecting", "signing", "uploading", "confirming"].includes(
              purpose === "room" ? this.data.roomUploadStatus : this.data.floorUploadStatus)) continue;
          if (error instanceof ApiRequestError && [401, 403, 404].includes(error.statusCode)) {
            this.recovery.files[purpose] = undefined;
            if (purpose === "room") this.setData({ roomFileId: "" });
            else this.setData({ floorFileId: "" });
            this.persistRecovery();
            this.setUploadState(purpose, "error", "图片不可访问，请重新选择");
          } else this.setUploadState(purpose, "checking", "暂无法查询图片状态，请稍后手动检查");
        }
      }
      this.updateCanGenerate();
    },
    async submitJob() {
      if (!dependencies.createRenderingJob || !this.visible || this.data.status !== "ready"
        || !this.data.canGenerate || this.submittingJob || this.recovery.jobId || !this.data.style) return;
      const app = dependencies.getApp();
      const bootstrap = await app.startup;
      if (!this.visible || !bootstrap) return;
      const identity = await dependencies.resolveRecoveryIdentity?.(app) ?? null;
      const scope = identityKey(identity);
      if (!scope || !this.scopeReady || scope !== this.recoveryScope) {
        this.applyRecoveryScope(identity);
        this.setData({ jobMessage: "登录身份已变化，请重新选择图片后再生成" });
        return;
      }
      const request = this.recovery.jobRequest ?? {
        style_asset_id: this.styleId,
        room_file_id: this.data.roomFileId,
        ...(this.data.floorFileId ? { floor_plan_file_id: this.data.floorFileId } : {}),
        space: this.data.style.space,
        mode: this.data.mode,
        ...(this.data.keepNotes.trim() ? { keep_notes: this.data.keepNotes.trim() } : {}),
        idempotency_key: (dependencies.createIdempotencyKey ?? createUuidV4IdempotencyKey)(),
      };
      this.recovery.jobRequest = request;
      if (!this.persistRecovery()) {
        this.recovery.jobRequest = undefined;
        this.setData({ jobMessage: "无法保存任务，请检查小程序存储后重试" });
        return;
      }
      this.setData({ jobDraftLocked: true });
      this.submittingJob = true;
      const recovery = this.recovery;
      const currentScope = () => this.visible && this.scopeReady
        && this.recoveryScope === scope && this.recovery === recovery;
      this.setData({ jobSubmitting: true, canGenerate: false,
        generateButtonLabel: "正在提交…", jobMessage: "正在提交生成任务…" });
      try {
        const created = await dependencies.createRenderingJob(app.api, request);
        if (!currentScope()) return;
        this.recovery.jobId = created.jobId;
        this.persistRecovery();
        this.setData({ jobId: created.jobId, jobStatus: created.status, jobMessage: "任务已提交，正在查询进度…" });
        await this.refreshJob();
      } catch (error) {
        if (!currentScope()) return;
        if (error instanceof ApiRequestError && (error.code === "RENDERING_INPUT_UNAVAILABLE"
          || error.code === "RENDERING_JOB_DISABLED")) {
          this.recovery.jobRequest = undefined;
          this.persistRecovery();
          this.setData({ jobDraftLocked: false });
        }
        this.setData({ jobMessage: jobErrorMessage(error) });
      } finally {
        if (currentScope()) {
          this.submittingJob = false;
          this.setData({ jobSubmitting: false });
          this.updateCanGenerate();
        }
      }
    },
    stopJobPolling() {
      if (this.jobTimer) clearTimeout(this.jobTimer);
      this.jobTimer = undefined;
    },
    async refreshJob(manual = false) {
      if (!dependencies.fetchRenderingJobStatus || !this.visible || !this.recovery.jobId) return;
      if (manual) { this.jobPolls = 0; this.stopJobPolling(); }
      const epoch = ++this.jobEpoch;
      const id = this.recovery.jobId;
      try {
        const progress = await dependencies.fetchRenderingJobStatus(dependencies.getApp().api, id);
        if (!this.visible || epoch !== this.jobEpoch || this.recovery.jobId !== id) return;
        this.setData({ jobStatus: progress.status, resultUrl: progress.result?.url ?? "",
          resultImageFailed: false, jobMessage: jobProgressMessage(progress.status, progress.failureReason) });
        this.stopJobPolling();
        if ((progress.status === "queued" || progress.status === "processing") && this.jobPolls < 24) {
          this.jobPolls++;
          this.jobTimer = setTimeout(() => { void this.refreshJob(); }, 5000);
        } else if (progress.status === "queued" || progress.status === "processing") {
          this.setData({ jobMessage: "生成仍在进行，请稍后手动刷新进度" });
        }
      } catch (error) {
        if (!this.visible || epoch !== this.jobEpoch) return;
        if (error instanceof ApiRequestError && [401, 403, 404].includes(error.statusCode)) {
          this.stopJobPolling();
          this.recovery.jobId = undefined;
          this.recovery.jobRequest = undefined;
          this.persistRecovery();
          this.setData({ jobId: "", jobStatus: "", jobDraftLocked: false, resultUrl: "",
            resultImageFailed: false, jobMessage: "任务不可访问，请重新提交" });
          this.updateCanGenerate();
        } else this.setData({ jobMessage: "暂无法查询任务进度，请手动刷新" });
      }
    },
    async upload(purpose: RenderingUploadPurpose) {
      if (!this.visible || !this.scopeReady || this.data.status !== "ready") return;
      if (this.recovery.jobRequest) {
        dependencies.showToast({ title: "请先确认当前生成任务", icon: "none" });
        return;
      }
      if (purpose === "floor_plan" && !this.data.roomFileId) {
        this.setUploadState("floor_plan", "idle", "请先上传房间照，再选择户型图");
        dependencies.showToast({ title: "请先上传房间照", icon: "none" });
        return;
      }
      if (this.uploading) return;
      if (this.pendingIntent[purpose]) {
        await this.retryComplete(purpose);
        return;
      }
      const epoch = this.uploadEpoch;
      const active = () => this.visible && this.scopeReady && epoch === this.uploadEpoch;
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
        this.persistRecovery();
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
      if (!this.visible || !this.scopeReady || this.data.status !== "ready" || this.uploading || !intentId) return;
      const epoch = this.uploadEpoch;
      const active = () => this.visible && this.scopeReady && epoch === this.uploadEpoch;
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
      this.setUploadState(purpose, "ready", "图片已就绪，可用于 AI 生成");
      this.persistRecovery();
    },
    setUploadState(purpose: RenderingUploadPurpose, status: UploadStatus, message: string) {
      if (purpose === "room") this.setData({ roomUploadStatus: status, roomUploadMessage: message });
      else this.setData({ floorUploadStatus: status, floorUploadMessage: message });
      this.updateCanGenerate();
    },
    handleUploadError(purpose: RenderingUploadPurpose, error: unknown) {
      if (error instanceof ApiRequestError && error.code === "IMAGE_SELECTION_CANCELLED") {
        this.setUploadState(purpose, this.recovery.files[purpose] ? "ready" : "idle",
          this.recovery.files[purpose] ? "原图已保留，可用于 AI 生成"
            : purpose === "room" ? "房间照为必传，最多 10 MiB" : "户型图可选，最多 10 MiB");
        return;
      }
      if (error instanceof ApiRequestError && (error.statusCode === 422
        || error.statusCode === 401 || error.code === "RENDERING_UPLOAD_EXPIRED"
        || error.code === "COS_PUT_REJECTED" || error.code === "RENDERING_INPUT_NOT_FOUND"
        || error.code === "RENDERING_INPUT_STATE_CONFLICT")) {
        this.pendingIntent[purpose] = undefined;
        this.persistRecovery();
      }
      const retryable = Boolean(this.pendingIntent[purpose]);
      const original = Boolean(this.recovery.files[purpose]);
      this.setUploadState(purpose, retryable ? "retry_complete" : original ? "ready" : "error",
        original && !retryable ? `原图已保留；${uploadErrorMessage(error, false)}` : uploadErrorMessage(error, retryable));
    },
    onBackToList() {
      void dependencies.navigateToList().catch(() => {
        dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
      });
    },
  });
}

type UploadStatus = "idle" | "selecting" | "signing" | "uploading" | "confirming"
  | "checking" | "ready" | "retry_complete" | "error";

function jobProgressMessage(status: RenderingJobStatus, failureReason?: 'content_rejected' | 'provider_rejected' | null): string {
  if (status === "queued") return "任务排队中，页面会自动更新进度";
  if (status === "processing") return "AI 参考效果图生成中，页面会自动更新进度";
  if (status === "succeeded") return "AI 参考效果图已完成";
  if (status === "review_required") return "任务结果需人工核对，请稍后刷新进度";
  if (failureReason === 'content_rejected') return "模型未接受当前图片或描述，请更换后重试";
  if (failureReason === 'provider_rejected') return "模型服务未接受本次请求，请稍后重试";
  return "生成失败，请稍后重试";
}

function jobErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "任务提交结果未确认，请继续提交同一任务";
  if (error.statusCode === 401) return "登录状态已失效，请重新进入后继续提交";
  if (error.code === "RENDERING_INPUT_UNAVAILABLE") return "上传图片尚未就绪，请检查图片状态";
  if (error.code === "RENDERING_QUOTA_EXHAUSTED") return "当前生成次数已用完";
  if (error.code === "RENDERING_JOB_DISABLED") return "AI 生成服务尚未开放，请稍后重试；图片仍可调整";
  return "任务提交结果未确认，请继续提交同一任务";
}

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
