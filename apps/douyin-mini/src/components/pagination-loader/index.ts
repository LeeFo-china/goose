Component({
  properties: {
    status: { type: String, value: "idle" },
  },
  methods: {
    onLoadMore() { if (this.data.status === "idle") this.triggerEvent("loadmore"); },
    onRetry() { if (this.data.status === "error") this.triggerEvent("retry"); },
  },
});
