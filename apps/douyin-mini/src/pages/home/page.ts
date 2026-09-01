import type { DouyinAppContext } from "../../app";
import type { fetchMaterials } from "../../api/materials";
import { resolveThemeColor } from "../../components/theme";
import { buildTrustMetrics, type TrustMetric } from "../../components/trust-metrics/view-model";
import type { DouyinMaterialNotePreview, PublicProject } from "../../models";
import type {
  navigateToEntityDetail, navigateToMaterialDetail, navigateToPage, switchToTab,
} from "../../platform/navigation";
import { projectDisplayPhaseLabel, uniqueProjectsById } from "../cases/project-phase";
import { MaterialExperienceLifecycle } from "../materials/page-model";

const SERVICE_PROCESS = [
  { id: "consult", index: "01", title: "沟通需求", description: "了解户型、预算和装修计划" },
  { id: "plan", index: "02", title: "方案确认", description: "由装修公司提供具体服务方案" },
  { id: "build", index: "03", title: "施工交付", description: "按双方确认的合同与节点推进" },
];

export type HomePageDependencies = {
  getApp(): DouyinAppContext;
  fetchMaterials: typeof fetchMaterials;
  navigateToEntityDetail: typeof navigateToEntityDetail;
  navigateToMaterialDetail: typeof navigateToMaterialDetail;
  navigateToPage: typeof navigateToPage;
  switchToTab: typeof switchToTab;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createHomePageDefinition(dependencies: HomePageDependencies) {
  return definePage({
    materialRequestSequence: 0,
    homeReady: false,
    lifecycle: new MaterialExperienceLifecycle(),
    data: {
      loading: true, error: false, brandName: "装修服务", logoUrl: "", city: "", summary: "",
      bannerTitle: "装修先规划，开工更放心",
      bannerSubtitle: "查看真实项目实景，再预约专人沟通", bannerImageUrl: "",
      primaryColor: "#191817", primaryTextColor: "#FFFFFF",
      metrics: [] as TrustMetric[],
      featuredProjects: [] as Array<PublicProject & { phaseLabel: string }>,
      serviceRegions: [] as string[], serviceProcess: SERVICE_PROCESS,
      materialItems: [] as DouyinMaterialNotePreview[],
      materialStatus: "loading" as "loading" | "ready" | "empty" | "error",
    },
    onLoad() { if (this.lifecycle.onLoad()) void this.load(); },
    onShow() {
      if (!this.lifecycle.onShow()) return;
      if (this.homeReady) void this.loadMaterials();
      else void this.load();
    },
    onHide() { this.lifecycle.onHide(); },
    onUnload() { this.lifecycle.onUnload(); },
    async load() {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      this.setData({ loading: true, error: false });
      try {
        const bootstrap = await dependencies.getApp().startup;
        if (!bootstrap || !this.lifecycle.isCurrent(authority)) return;
        const banner = bootstrap.content.home_banners[0];
        const city = bootstrap.company.address_region.city
          || bootstrap.company.service_regions[0]?.city
          || "";
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        this.homeReady = true;
        this.setData({
          loading: false, brandName: bootstrap.company.name,
          logoUrl: bootstrap.company.logo_url || "", city,
          summary: bootstrap.company.summary || "",
          bannerTitle: banner?.title || "装修先规划，开工更放心",
          bannerSubtitle: banner?.subtitle || "查看真实项目实景，再预约专人沟通",
          bannerImageUrl: banner?.image_url || "",
          primaryColor: theme.primaryColor, primaryTextColor: theme.primaryTextColor,
          metrics: buildTrustMetrics(bootstrap.content.trust_metrics),
          featuredProjects: uniqueProjectsById(bootstrap.content.featured_projects)
            .slice(0, 2)
            .map((project) => ({ ...project, phaseLabel: projectDisplayPhaseLabel(project) })),
          serviceRegions: formatRegions(bootstrap.company.service_regions),
        });
        dependencies.getApp().recordAnalytics("page_view");
        void this.loadMaterials();
      } catch {
        if (this.lifecycle.isCurrent(authority)) this.setData({ loading: false, error: true });
      }
    },
    async loadMaterials() {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      const sequence = this.materialRequestSequence + 1;
      this.materialRequestSequence = sequence;
      this.setData({ materialStatus: "loading" });
      try {
        const result = await dependencies.fetchMaterials(dependencies.getApp().api, {
          page: 1, pageSize: 4,
        });
        if (sequence !== this.materialRequestSequence || !this.lifecycle.isCurrent(authority)) return;
        this.setData({
          materialItems: result.list.slice(0, 4),
          materialStatus: result.list.length > 0 ? "ready" : "empty",
        });
      } catch {
        if (sequence !== this.materialRequestSequence || !this.lifecycle.isCurrent(authority)) return;
        this.setData({ materialItems: [], materialStatus: "error" });
      }
    },
    onBudget() { this.navigateWithFeedback(dependencies.switchToTab("budget")); },
    onAskQuestion() { this.navigateWithFeedback(dependencies.navigateToPage("pages/qa/index")); },
    onViewProjects() { this.navigateWithFeedback(dependencies.switchToTab("cases")); },
    onViewCompany() { this.navigateWithFeedback(dependencies.navigateToPage("pages/company/index")); },
    onViewPrivacy() { this.navigateWithFeedback(dependencies.navigateToPage("pages/privacy/index")); },
    onViewMaterials() { this.navigateWithFeedback(dependencies.navigateToPage("pages/materials/index")); },
    onViewMyMaterials() { this.navigateWithFeedback(dependencies.navigateToPage("pages/my-materials/index")); },
    onRetryMaterials() { void this.loadMaterials(); },
    onMaterialSelect(event: { detail: { id?: string } }) {
      if (event.detail.id) this.navigateWithFeedback(dependencies.navigateToMaterialDetail(event.detail.id));
    },
    onProjectSelect(event: { detail: { id?: string } }) {
      if (event.detail.id) {
        this.navigateWithFeedback(dependencies.navigateToEntityDetail("case", event.detail.id));
      }
    },
    navigateWithFeedback(promise: Promise<void>) {
      const authority = this.lifecycle.beginOperation();
      if (!authority) return;
      void promise.catch(() => {
        if (this.lifecycle.isCurrent(authority)) {
          dependencies.showToast({ title: "页面跳转失败，请重试", icon: "none" });
        }
      });
    },
  });
}

function formatRegions(
  regions: Array<{ province: string | null; city: string; district: string | null }>,
) {
  return [...new Set(regions.map((region) =>
    [region.city, region.district].filter(Boolean).join(" · ")))].slice(0, 12);
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}
