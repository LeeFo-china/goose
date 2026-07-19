Component({
  properties: {
    title: { type: String, value: "装修先规划，开工更放心" },
    subtitle: { type: String, value: "查看案例与在建工地，再预约专人沟通" },
    imageUrl: { type: String, value: "" },
    actionLabel: { type: String, value: "预约免费咨询" },
    primaryColor: { type: String, value: "#C45A32" },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  methods: {
    onAction() { this.triggerEvent("action"); },
    onRetry() { this.triggerEvent("retry"); },
  },
});
