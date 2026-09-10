import type { DouyinAppContext } from "../../app";
import type {
  fetchCustomerProjectDetail,
  fetchCustomerProjectLogs,
} from "../../api/customer";
import type { CustomerProject, CustomerProjectLog } from "../../models";

type LoadMode = "refresh" | "loadMore" | "retry";

export type CustomerProjectDetailPageDependencies = {
  getApp(): Pick<DouyinAppContext, "customerApi">;
  fetchCustomerProjectDetail: typeof fetchCustomerProjectDetail;
  fetchCustomerProjectLogs: typeof fetchCustomerProjectLogs;
  showToast(options: { title: string; icon: "none" }): void;
  stopPullDownRefresh(): void;
};

export function createCustomerProjectDetailPageDefinition(
  dependencies: CustomerProjectDetailPageDependencies,
) {
  return definePage({
    projectId: "",
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    data: {
      project: null as CustomerProject | null,
      logs: [] as CustomerProjectLog[],
      firstLoading: false,
      firstError: false,
      emptyLogs: false,
      paginationStatus: "idle" as "idle" | "loading" | "nomore" | "error",
    },
    onLoad(options: { id?: string } = {}) { if (options.id) void this.load(options.id, "refresh"); },
    onPullDownRefresh() { void this.load(this.projectId, "refresh", true); },
    onReachBottom() { void this.load(this.projectId, "loadMore"); },
    async load(projectId: string, mode: LoadMode, stopRefresh = false) {
      if (!projectId || this.loading) return;
      const nextPage = mode === "loadMore" ? this.page + 1 : 1;
      if (mode === "loadMore" && !this.hasMore) return;
      this.projectId = projectId;
      this.loading = true;
      this.setData({
        firstLoading: mode === "refresh" && !this.data.project,
        firstError: false,
        paginationStatus: mode === "loadMore" ? "loading" : "idle",
      });
      try {
        const [project, logs] = await Promise.all([
          mode === "loadMore" && this.data.project
            ? Promise.resolve(this.data.project)
            : dependencies.fetchCustomerProjectDetail(dependencies.getApp().customerApi, projectId),
          dependencies.fetchCustomerProjectLogs(
            dependencies.getApp().customerApi,
            projectId,
            { page: nextPage, pageSize: this.pageSize },
          ),
        ]);
        const list = mode === "loadMore" ? [...this.data.logs, ...logs.list] : logs.list;
        this.page = logs.pagination.page;
        this.hasMore = logs.pagination.page < logs.pagination.totalPages;
        this.setData({
          project,
          logs: list,
          firstLoading: false,
          emptyLogs: list.length === 0,
          paginationStatus: this.hasMore ? "idle" : "nomore",
        });
      } catch {
        this.setData({
          firstLoading: false,
          firstError: !this.data.project,
          paginationStatus: this.data.logs.length ? "error" : "idle",
        });
      } finally {
        this.loading = false;
        if (stopRefresh) dependencies.stopPullDownRefresh();
      }
    },
    onRetry() { void this.load(this.projectId, "retry"); },
    onLoadMore() { void this.load(this.projectId, "loadMore"); },
  });
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}
