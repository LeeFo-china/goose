Component({
  properties: {
    items: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  methods: {
    onPreview(event: { currentTarget: { dataset: { url?: string } } }) {
      const current = event.currentTarget.dataset.url;
      const urls = this.data.items
        .map((item) => typeof item.url === "string" ? item.url : "")
        .filter(Boolean);
      if (!current || !urls.includes(current)) return;
      tt.previewImage({ urls, current, showmenu: false });
    },
    onRetry() { this.triggerEvent("retry"); },
  },
});
