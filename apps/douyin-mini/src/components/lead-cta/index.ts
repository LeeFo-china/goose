Component({
  properties: {
    title: { type: String, value: "想了解适合你家的装修方案？" },
    description: { type: String, value: "留下联系方式，由装修公司专人与你沟通需求。" },
    actionLabel: { type: String, value: "预约免费咨询" },
    primaryColor: { type: String, value: "#C45A32" },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  methods: {
    onAction() {
      if (!this.data.loading && !this.data.disabled) this.triggerEvent("action");
    },
    onRetry() { this.triggerEvent("retry"); },
  },
});
