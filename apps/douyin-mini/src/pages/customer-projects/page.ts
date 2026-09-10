import type { DouyinAppContext } from "../../app";
import type { fetchCustomerProjects } from "../../api/customer";
import type { CustomerProject } from "../../models";
import type { navigateToCustomerProjectDetail, navigateToPage } from "../../platform/navigation";

type LoadMode = "refresh" | "loadMore" | "retry";

export type CustomerProjectsPageDependencies = {
  getApp(): Pick<DouyinAppContext, "customerApi">;
  fetchCustomerProjects: typeof fetchCustomerProjects;
  navigateToCustomerProjectDetail: typeof navigateToCustomerProjectDetail;
  navigateToPage: typeof navigateToPage;
  showToast(options: { title: string; icon: "none" }): void;
  stopPullDownRefresh(): void;
};

export function createCustomerProjectsPageDefinition(dependencies: CustomerProjectsPageDependencies) {
  return definePage({
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    data: {
      items: [] as CustomerProject[],
      firstLoading: false,
      firstError: false,
      empty: false,
      paginationStatus: "idle" as "idle" | "loading" | "nomore" | "error",
    },
    onLoad() { void this.load("refresh"); },
    onPullDownRefresh() { void this.load("refresh", true); },
    onReachBottom() { void this.load("loadMore"); },
    async load(mode: LoadMode, stopRefresh = false) {
      if (this.loading) return;
      const nextPage = mode === "loadMore" ? this.page + 1 : 1;
      if (mode === "loadMore" && !this.hasMore) return;
      this.loading = true;
      this.setData({
        firstLoading: mode === "refresh" && this.data.items.length === 0,
        firstError: false,
        paginationStatus: mode === "loadMore" ? "loading" : "idle",
      });
      try {
        const result = await dependencies.fetchCustomerProjects(
          dependencies.getApp().customerApi,
          { page: nextPage, pageSize: this.pageSize },
        );
        const items = mode === "loadMore"
          ? [...this.data.items, ...result.list]
          : result.list;
        this.page = result.pagination.page;
        this.hasMore = result.pagination.page < result.pagination.totalPages;
        this.setData({
          items,
          firstLoading: false,
          empty: items.length === 0,
          paginationStatus: this.hasMore ? "idle" : "nomore",
        });
      } catch {
        this.setData({
          firstLoading: false,
          firstError: this.data.items.length === 0,
          paginationStatus: this.data.items.length ? "error" : "idle",
        });
      } finally {
        this.loading = false;
        if (stopRefresh) dependencies.stopPullDownRefresh();
      }
    },
    onProjectSelect(event: { currentTarget: { dataset: { id?: string } } }) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      void dependencies.navigateToCustomerProjectDetail(id).catch(() =>
        dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" })
      );
    },
    onLogin() { void dependencies.navigateToPage("pages/customer-login/index"); },
    onRetry() { void this.load("retry"); },
    onLoadMore() { void this.load("loadMore"); },
  });
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}
