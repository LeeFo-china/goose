import {
  buildImageGallery,
  removeFailedImage,
  type GalleryImage,
} from "./view-model";

Component({
  data: {
    visibleItems: [] as GalleryImage[],
    imageError: false,
  },
  properties: {
    items: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false },
  },
  observers: {
    items(value: unknown) {
      this.setData({ visibleItems: buildImageGallery(value), imageError: false });
    },
  },
  methods: {
    onPreview(event: { currentTarget: { dataset: { url?: string } } }) {
      const current = event.currentTarget.dataset.url;
      const urls = this.data.visibleItems.map((item) => item.url);
      if (!current || !urls.includes(current)) return;
      tt.previewImage({ urls, current, showmenu: false });
    },
    onImageError(event: { currentTarget: { dataset: { url?: string } } }) {
      const url = event.currentTarget.dataset.url;
      if (!url) return;
      const visibleItems = removeFailedImage(this.data.visibleItems, url);
      this.setData({ visibleItems, imageError: visibleItems.length === 0 });
      this.triggerEvent("imageerror", { url });
    },
    onRetry() {
      this.setData({ visibleItems: buildImageGallery(this.data.items), imageError: false });
      this.triggerEvent("retry");
    },
  },
});
