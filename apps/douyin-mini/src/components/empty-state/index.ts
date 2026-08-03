Component({
  properties: {
    title: { type: String, value: "暂无内容" },
    description: { type: String, value: "相关内容正在完善，请稍后再来查看。" },
    actionLabel: { type: String, value: "" },
  },
  methods: { onAction() { this.triggerEvent("action"); } },
});
