export type GalleryImage = {
  url: string;
  previewIndex: number;
};

export function buildImageGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const candidate = typeof item === "string"
      ? item
      : isRecord(item) && typeof item.url === "string" ? item.url : "";
    const url = candidate.trim();
    if (!/^https:\/\/[^\s]+$/i.test(url) || unique.has(url)) continue;
    unique.add(url);
    if (unique.size === 9) break;
  }
  return Array.from(unique, (url, previewIndex) => ({ url, previewIndex }));
}

export function removeFailedImage(images: GalleryImage[], failedUrl: string): GalleryImage[] {
  return images
    .filter((image) => image.url !== failedUrl)
    .map((image, previewIndex) => ({ ...image, previewIndex }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
