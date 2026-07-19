Component({
  properties: {
    item: { type: Object, value: {} },
    fallbackImageUrl: { type: String, value: "" },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  methods: {
    onSelect() {
      if (typeof this.data.item.id === "string") {
        this.triggerEvent("select", { id: this.data.item.id });
      }
    },
    onRetry() { this.triggerEvent("retry"); },
  },
});
