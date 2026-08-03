Component({
  data: { imageFailed: false },
  properties: {
    item: { type: Object, value: {} },
    fallbackImageUrl: { type: String, value: "" },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
    primaryColor: { type: String, value: "#191817" },
    primaryTextColor: { type: String, value: "#FFFFFF" },
  },
  observers: {
    "item, fallbackImageUrl"() { this.setData({ imageFailed: false }); },
  },
  methods: {
    onSelect() {
      if (typeof this.data.item.id === "string") {
        this.triggerEvent("select", { id: this.data.item.id });
      }
    },
    onImageError() {
      this.setData({ imageFailed: true });
      this.triggerEvent("imageerror", { id: this.data.item.id });
    },
    onRetry() { this.triggerEvent("retry"); },
  },
});
