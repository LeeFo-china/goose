import type { DouyinAppContext } from "../../app";
import { fetchCaseDetail } from "../../api/cases";
import type { PublicProject } from "../../models";
import { switchToTab } from "../../platform/navigation";

Page({
  caseId: "",
  data: {
    loading: true,
    error: false,
    project: null as PublicProject | null,
    images: [] as string[],
    styleText: "",
    updatedDate: "",
    primaryColor: "#C45A32",
  },
  onLoad(query) {
    this.caseId = query.id || "";
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const app = getApp<DouyinAppContext>();
      const bootstrap = await app.startup;
      if (!bootstrap) return;
      const project = await fetchCaseDetail(app.api, this.caseId);
      const images = project.cover_image_url
        ? [project.cover_image_url, ...project.public_images.filter((url) =>
            url !== project.cover_image_url)]
        : project.public_images;
      this.setData({
        loading: false,
        project,
        images,
        styleText: project.style_tags.join(" · "),
        updatedDate: project.updated_at.slice(0, 10),
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
