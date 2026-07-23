import { resolveThemeColor } from "../theme";

Component({
  data: {
    imageFailed: false,
    resolvedPrimaryColor: "#191817",
    resolvedPrimaryTextColor: "#FFFFFF",
  },
  properties: {
    title: { type: String, value: "装修先规划，开工更放心" },
    subtitle: { type: String, value: "查看案例与在建工地，再预约专人沟通" },
    imageUrl: { type: String, value: "" },
    actionLabel: { type: String, value: "预约免费咨询" },
    primaryColor: { type: String, value: "#191817" },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  observers: {
    imageUrl() { this.setData({ imageFailed: false }); },
    primaryColor(value: unknown) {
      const theme = resolveThemeColor(value);
      this.setData({
        resolvedPrimaryColor: theme.primaryColor,
        resolvedPrimaryTextColor: theme.primaryTextColor,
      });
    },
  },
  methods: {
    onAction() { this.triggerEvent("action"); },
    onImageError() {
      this.setData({ imageFailed: true });
      this.triggerEvent("imageerror");
    },
    onRetry() { this.triggerEvent("retry"); },
  },
});
