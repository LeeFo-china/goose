export type GalleryImage = {
  url: string;
  previewIndex: number;
  className: string;
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
  return applyImageLayout(Array.from(unique, (url, previewIndex) => ({ url, previewIndex })));
}

export function removeFailedImage(images: GalleryImage[], failedUrl: string): GalleryImage[] {
  return applyImageLayout(images
    .filter((image) => image.url !== failedUrl)
    .map((image, previewIndex) => ({ url: image.url, previewIndex })));
}

export function buildGalleryLayoutClass(count: number): string {
  if (count <= 1) return "gallery--single";
  if (count === 2) return "gallery--two";
  if (count === 3) return "gallery--three";
  if (count === 4) return "gallery--grid";
  return "gallery--dense";
}

function applyImageLayout(images: Array<Omit<GalleryImage, "className">>): GalleryImage[] {
  const count = images.length;
  return images.map((image, index) => ({
    ...image,
    className: imageClassName(count, index),
  }));
}

function imageClassName(count: number, index: number): string {
  if (count === 1) return "gallery-item--hero";
  if (count === 2) return "gallery-item--half";
  if (count === 3) return index === 0 ? "gallery-item--hero" : "gallery-item--half";
  if (count === 4) return "gallery-item--half";
  return "gallery-item--third";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
