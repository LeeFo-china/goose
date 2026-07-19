import type { DouyinAppContext } from "../../app";

Page({
  data: {
    loading: true,
    error: false,
    companyName: "装修服务提供方",
    servicePhone: "",
    version: "",
  },
  onLoad() { void this.load(); },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) return;
      this.setData({
        loading: false,
        companyName: bootstrap.company.name,
        servicePhone: bootstrap.company.service_phone,
        version: bootstrap.privacy_policy_version,
      });
    } catch {
      this.setData({ loading: false, error: true });
    }
  },
});
