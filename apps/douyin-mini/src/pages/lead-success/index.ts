import type { DouyinAppContext } from "../../app";
import { switchToTab } from "../../platform/navigation";
import { parseLeadSuccessOptions } from "../lead/form-model";

Page({
  data: {
    loading: true,
    invalid: false,
    appointmentNo: "",
    companyName: "",
    preferredVisitDateLabel: "",
    preferredVisitPeriodLabel: "",
    contactSlaText: "",
    estimateLinked: false,
  },
  onLoad(options) { void this.load(options); },
  async load(options: Record<string, string | undefined>) {
    const result = parseLeadSuccessOptions(options);
    if (!result) {
      this.setData({ loading: false, invalid: true });
      return;
    }
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) {
        this.setData({ loading: false, invalid: true });
        return;
      }
      this.setData({
        loading: false,
        invalid: false,
        appointmentNo: result.appointmentNo,
        companyName: bootstrap.company.name,
        preferredVisitDateLabel: result.preferredVisitDateLabel,
        preferredVisitPeriodLabel: result.preferredVisitPeriodLabel,
        contactSlaText: bootstrap.contact_sla_text,
        estimateLinked: result.estimateLinked,
      });
    } catch {
      this.setData({ loading: false, invalid: true });
    }
  },
  onViewBudget() {
    void switchToTab("budget")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
  onBackAppointment() {
    void switchToTab("lead")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
  onBackHome() {
    void switchToTab("home")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
