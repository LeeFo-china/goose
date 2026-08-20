import type { DouyinAppContext } from "../../app";
import { fetchProjects } from "../../api/projects";
import { resolveThemeColor } from "../../components/theme";
import type { UnifiedPublicProject } from "../../models";
import { navigateToEntityDetail } from "../../platform/navigation";
import {
  beginPaginationRequest,
  createPaginationState,
  rejectPaginationRequest,
  resolvePaginationRequest,
} from "../../utils/pagination";
import {
  clearCaseFilters,
  hasActiveCaseFilters,
  toggleCaseFilter,
} from "./filter-state";
import {
  PROJECT_PHASE_FILTERS,
  projectFilterToPhase,
  projectPhaseLabel,
  type ProjectFilter,
} from "./project-phase";

type ProjectFilters = {
  selectedPhase: ProjectFilter;
  selectedStyle: string;
  selectedLayout: string;
};

type ProjectListItem = UnifiedPublicProject & { phaseLabel: string };

Page({
  pagination: createPaginationState<UnifiedPublicProject>(20),
  data: {
    items: [] as ProjectListItem[],
    firstLoading: true,
    firstError: false,
    paginationStatus: "idle",
    styleOptions: [] as string[],
    layoutOptions: [] as string[],
    selectedStyle: "",
    selectedLayout: "",
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
    selectedFilters?: ProjectFilters,
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
      const filters = selectedFilters ?? this.readFilters();
      const phase = projectFilterToPhase(filters.selectedPhase);
      const result = await fetchProjects(getApp<DouyinAppContext>().api, {
        page: pending.request.page,
        pageSize: pending.request.pageSize,
        ...(phase ? { phase } : {}),
        ...(filters.selectedStyle ? { style: filters.selectedStyle } : {}),
        ...(filters.selectedLayout ? { layout: filters.selectedLayout } : {}),
      });
      const isCurrentRequest = pending.request.sequence === this.pagination.requestSequence;
      this.pagination = resolvePaginationRequest(this.pagination, pending.request, result);
      if (isCurrentRequest) {
        this.setData({
          styleOptions: mergeOptions(this.data.styleOptions,
            result.items.flatMap((item) => item.style_tags)),
          layoutOptions: mergeOptions(this.data.layoutOptions,
            result.items.map((item) => item.layout)
              .filter((item): item is string => Boolean(item))),
        });
      }
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
        phaseLabel: projectPhaseLabel(project.phase),
      })),
      firstLoading: this.pagination.status === "loading" && this.pagination.items.length === 0,
      firstError: this.pagination.status === "error" && this.pagination.items.length === 0,
      paginationStatus: this.pagination.status,
    });
  },
  onRetry() { void this.load("retry"); },
  onLoadMore() { void this.load("loadMore"); },
  onSelectStyle(event: { currentTarget: { dataset: { value?: string } } }) {
    this.applyFilters({
      selectedPhase: this.data.selectedPhase,
      ...toggleCaseFilter(
      this.data,
      "style",
      event.currentTarget.dataset.value || "",
      ),
    });
  },
  onSelectLayout(event: { currentTarget: { dataset: { value?: string } } }) {
    this.applyFilters({
      selectedPhase: this.data.selectedPhase,
      ...toggleCaseFilter(
      this.data,
      "layout",
      event.currentTarget.dataset.value || "",
      ),
    });
  },
  onSelectPhase(event: { currentTarget: { dataset: { value?: string } } }) {
    const selectedPhase = event.currentTarget.dataset.value;
    if (selectedPhase !== "all"
      && selectedPhase !== "in_progress"
      && selectedPhase !== "completed") return;
    if (selectedPhase === this.data.selectedPhase) return;
    this.applyFilters({ ...this.readFilters(), selectedPhase });
  },
  onClearFilters() {
    if (!this.hasActiveFilters(this.readFilters())) return;
    this.applyFilters({ selectedPhase: "all", ...clearCaseFilters() });
  },
  applyFilters(filters: ProjectFilters) {
    this.setData({
      ...filters,
      hasActiveFilters: this.hasActiveFilters(filters),
    });
    void this.load("refresh", filters);
  },
  readFilters(): ProjectFilters {
    return {
      selectedPhase: this.data.selectedPhase,
      selectedStyle: this.data.selectedStyle,
      selectedLayout: this.data.selectedLayout,
    };
  },
  hasActiveFilters(filters: ProjectFilters) {
    return filters.selectedPhase !== "all" || hasActiveCaseFilters(filters);
  },
  onProjectSelect(event: { detail: { id?: string } }) {
    if (!event.detail.id) return;
    void navigateToEntityDetail("case", event.detail.id)
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});

function mergeOptions(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming])].slice(0, 8);
}
