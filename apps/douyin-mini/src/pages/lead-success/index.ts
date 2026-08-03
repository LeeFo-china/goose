import { switchToTab } from "../../platform/navigation";

Page({
  onBackHome() {
    void switchToTab("home")
      .catch(() => tt.showToast({ title: "页面跳转失败，请重试", icon: "none" }));
  },
});
