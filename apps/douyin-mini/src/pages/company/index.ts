import type { DouyinAppContext } from "../../app";
import { fetchCompany } from "../../api/company";
import type { CompanyData } from "../../models";
import { switchToTab } from "../../platform/navigation";

Page({
  data: {
    loading: true,
    error: false,
    company: null as CompanyData | null,
    city: "",
    regionLabels: [] as string[],
    qualificationImages: [] as string[],
    primaryColor: "#C45A32",
  },
  onLoad() { void this.load(); },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const app = getApp<DouyinAppContext>();
      const bootstrap = await app.startup;
      if (!bootstrap) return;
      const company = await fetchCompany(app.api);
      this.setData({
        loading: false,
        company,
        city: company.address_region.city || company.service_regions[0]?.city || "",
        regionLabels: [...new Set(company.service_regions.map((region) =>
          [region.city, region.district].filter(Boolean).join(" · ")))],
        qualificationImages: company.qualifications
          .map((item) => item.image_url)
          .filter((url): url is string => Boolean(url)),
        primaryColor: bootstrap.theme.primary_color,
      });
    } catch {
      this.setData({ loading: false, error: true });
    }
  },
  onLead() {
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
