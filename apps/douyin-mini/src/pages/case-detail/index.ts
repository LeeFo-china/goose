import type { DouyinAppContext } from "../../app";
import { fetchProjectDetail, fetchProjectLogs } from "../../api/projects";
import type { PublicSiteLog, UnifiedPublicProject } from "../../models";
import { switchToTab } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import { projectPhaseLabel } from "../cases/project-phase";
import { buildSiteProgress, type SiteProgressItem } from "../site-detail/site-progress";

Page({
  projectId: "",
  loadingProject: false,
  logPagination: createPaginationState<PublicSiteLog>(20),
  data: {
    loading: true,
    error: false,
    project: null as UnifiedPublicProject | null,
    images: [] as string[],
    styleText: "",
    phaseLabel: "",
    isInProgress: false,
    updatedDate: "",
    primaryColor: "#191817",
    progress: [] as SiteProgressItem[],
    progressFirstLoading: false,
    progressFirstError: false,
    progressStatus: "idle",
  },
  onLoad(query) {
    this.projectId = query.id || "";
    void this.load();
  },
  onReachBottom() {
    if (this.data.isInProgress && this.data.project) void this.loadLogs("loadMore");
  },
  async load() {
    if (this.loadingProject) return;
    this.loadingProject = true;
    this.setData({ loading: true, error: false });
    try {
      const app = getApp<DouyinAppContext>();
      const bootstrap = await app.startup;
      if (!bootstrap) return;
      const project = await fetchProjectDetail(app.api, this.projectId);
      const images = project.cover_image_url
        ? [project.cover_image_url, ...project.public_images.filter((url) =>
            url !== project.cover_image_url)]
        : project.public_images;
      this.setData({
        loading: false,
        project,
        images,
        styleText: project.style_tags.join(" · "),
        phaseLabel: projectPhaseLabel(project.phase),
        isInProgress: project.phase === "in_progress",
        updatedDate: project.updated_at.slice(0, 10),
        primaryColor: bootstrap.theme.primary_color,
        progress: [],
        progressFirstLoading: false,
        progressFirstError: false,
        progressStatus: "idle",
      });
      this.logPagination = createPaginationState<PublicSiteLog>(20);
      app.recordAnalytics("case_view", project.id);
      if (project.phase === "in_progress") await this.loadLogs("loadMore");
    } catch {
      this.setData({ loading: false, error: true, project: null });
    } finally {
      this.loadingProject = false;
    }
  },
  async loadLogs(mode: "loadMore" | "retry") {
    if (!this.data.isInProgress || !this.data.project) return;
    if (mode === "loadMore" && (this.logPagination.status === "loading"
      || this.logPagination.status === "end")) return;
    const pending = beginPaginationRequest(this.logPagination, mode);
    this.logPagination = pending.state;
    this.syncProgress();
    try {
      const result = await fetchProjectLogs(
        getApp<DouyinAppContext>().api,
        this.projectId,
        { page: pending.request.page, pageSize: pending.request.pageSize },
      );
      this.logPagination = resolvePaginationRequest(
        this.logPagination,
        pending.request,
        result,
      );
    } catch {
      this.logPagination = rejectPaginationRequest(this.logPagination, pending.request);
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
  onRetryProgress() { void this.loadLogs("retry"); },
  onLoadMoreProgress() { void this.loadLogs("loadMore"); },
  onLead() {
    getApp<DouyinAppContext>().recordAnalytics("lead_cta_click", this.projectId);
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
