Component({
  properties: {
    title: { type: String, value: "内容加载失败" },
    description: { type: String, value: "请检查网络后重试，已加载内容不会丢失。" },
    retryLabel: { type: String, value: "重新加载" },
    retrying: { type: Boolean, value: false },
  },
  methods: { onRetry() { if (!this.data.retrying) this.triggerEvent("retry"); } },
});
