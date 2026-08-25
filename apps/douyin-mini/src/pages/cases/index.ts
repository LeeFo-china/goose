import type { DouyinAppContext } from "../../app";
import { fetchProjects } from "../../api/projects";
import { resolveThemeColor } from "../../components/theme";
import type { PublicProject } from "../../models";
import { navigateToEntityDetail } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import {
  createProjectPhaseSelection,
  PROJECT_PHASE_FILTERS,
  projectDisplayPhaseLabel,
  projectFilterToPhase,
  type ProjectFilter,
} from "./project-phase";

type ProjectFilterSnapshot = {
  selectedPhase: ProjectFilter;
};

type ProjectListItem = PublicProject & { phaseLabel: string };

Page({
  pagination: createPaginationState<PublicProject>(20),
  data: {
    items: [] as ProjectListItem[],
    firstLoading: true,
    firstError: false,
    paginationStatus: "idle",
    selectedPhase: "all" as ProjectFilter,
    phaseFilters: PROJECT_PHASE_FILTERS,
    featureReady: false,
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
    activeFilterStyle: "border-color: #191817; background-color: #191817; color: #FFFFFF;",
    hasActiveFilters: false,
  },
  onLoad() { void this.initialize(); },
  onReachBottom() {
    if (this.data.featureReady) void this.load("loadMore");
  },
  onPullDownRefresh() {
    if (!this.data.featureReady) {
      void tt.stopPullDownRefresh({});
      return;
    }
    void this.load("refresh");
  },
  async initialize() {
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      const themeData = {
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
        activeFilterStyle: `border-color: ${theme.primaryColor}; background-color: ${theme.primaryColor}; color: ${theme.primaryTextColor};`,
      };
      this.setData({ featureReady: true, ...themeData });
      await this.load("loadMore");
    } catch {
      this.setData({ firstLoading: false, firstError: true });
    }
  },
  async load(
    mode: "loadMore" | "refresh" | "retry",
    filterSnapshot?: ProjectFilterSnapshot,
  ) {
    if (!this.data.featureReady) {
      if (mode === "refresh") void tt.stopPullDownRefresh({});
      return;
    }
    if (mode === "loadMore" && (this.pagination.status === "loading"
      || this.pagination.status === "end")) return;
    const pending = beginPaginationRequest(this.pagination, mode);
    this.pagination = pending.state;
    this.syncState();
    try {
      const selectedPhase = filterSnapshot?.selectedPhase ?? this.data.selectedPhase;
      const phase = projectFilterToPhase(selectedPhase);
      const result = await fetchProjects(getApp<DouyinAppContext>().api, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
        ...(phase ? { phase } : {}),
      });
      this.pagination = resolvePaginationRequest(this.pagination, pending.request, result);
    } catch {
      this.pagination = rejectPaginationRequest(this.pagination, pending.request);
    } finally {
      this.syncState();
      if (mode === "refresh") void tt.stopPullDownRefresh({});
    }
  },
  syncState() {
    this.setData({
      items: this.pagination.items.map((project) => ({
          ...project,
          phaseLabel: projectDisplayPhaseLabel(project),
        })),
      firstLoading: this.pagination.status === "loading" && this.pagination.items.length === 0,
      firstError: this.pagination.status === "error" && this.pagination.items.length === 0,
      paginationStatus: this.pagination.status,
    });
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onSelectPhase(event: { currentTarget: { dataset: { value?: string } } }) {
    const selection = createProjectPhaseSelection(
      this.data.selectedPhase,
      event.currentTarget.dataset.value,
    );
    if (!selection) return;
    this.setData({
      selectedPhase: selection.selectedPhase,
      hasActiveFilters: selection.selectedPhase !== "all",
    });
    void this.load(selection.loadMode, selection.filterSnapshot);
  },
  onProjectSelect(event: { detail: { id?: string } }) {
    if (!event.detail.id) return;
    void navigateToEntityDetail("case", event.detail.id)
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
