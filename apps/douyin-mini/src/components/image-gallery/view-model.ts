export type GalleryImage = {
  url: string;
  previewIndex: number;
};

export function buildImageGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!/^https:\/\/[^\s]+$/i.test(url) || unique.has(url)) continue;
    unique.add(url);
    if (unique.size === 9) break;
  }
  return Array.from(unique, (url, previewIndex) => ({ url, previewIndex }));
}
