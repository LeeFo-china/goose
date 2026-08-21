import type { DouyinAppContext } from "../../app";
import type { DouyinVisitPeriod } from "../../models";
import { switchToTab } from "../../platform/navigation";
import {
  readMeasurementSuccessContext,
  writeBudgetResultReturnIntent,
} from "../../platform/measurement-success-context";

const VISIT_PERIOD_LABELS: Readonly<Record<DouyinVisitPeriod, string>> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚间",
};

Page({
  linkedEstimateId: "",
  unloaded: false,
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
  onLoad() { void this.load(); },
  onUnload() { this.unloaded = true; },
  async load() {
    const result = readMeasurementSuccessContext();
    if (!result) {
      this.setData({ loading: false, invalid: true });
      return;
    }
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (this.unloaded) return;
      if (!bootstrap) {
        this.setData({ loading: false, invalid: true });
        return;
      }
      this.setData({
        loading: false,
        invalid: false,
        appointmentNo: result.appointmentNo,
        companyName: bootstrap.company.name,
        preferredVisitDateLabel: formatVisitDate(result.preferredVisitDate),
        preferredVisitPeriodLabel: VISIT_PERIOD_LABELS[result.preferredVisitPeriod],
        contactSlaText: bootstrap.contact_sla_text,
        estimateLinked: result.linkedEstimateId !== null,
      });
      this.linkedEstimateId = result.linkedEstimateId ?? "";
    } catch {
      if (!this.unloaded) this.setData({ loading: false, invalid: true });
    }
  },
  onViewBudget() {
    if (!writeBudgetResultReturnIntent(this.linkedEstimateId)) {
      void tt.showToast({ title: "预算结果暂时无法打开", icon: "none" });
      return;
    }
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

function formatVisitDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}
