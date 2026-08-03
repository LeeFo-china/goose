import {
  buildImageGallery,
  type GalleryImage,
} from "../../components/image-gallery/view-model";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGE_LABELS: Record<string, string> = {
  started: "已开工",
  construction: "施工中",
  constructing: "施工中",
  "water-electric": "水电施工",
};

export type SiteProgressItem = {
  id: string;
  stageCode: string | null;
  title: string;
  images: GalleryImage[];
  createdAt: string;
  date: string;
};

export function buildSiteProgress(value: unknown): SiteProgressItem[] {
  if (!Array.isArray(value)) return [];
  const progress: SiteProgressItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !UUID_PATTERN.test(item.id)
      || typeof item.created_at !== "string" || !validDate(item.created_at)) continue;
    const stageCode = typeof item.stage_code === "string" && item.stage_code.length <= 80
      ? item.stage_code
      : null;
    const nodeName = typeof item.node_name === "string" && item.node_name.trim()
      && item.node_name.length <= 120
      ? item.node_name.trim()
      : "";
    progress.push({
      id: item.id,
      stageCode,
      title: nodeName || (stageCode ? STAGE_LABELS[stageCode] : "") || "施工进度",
      images: buildImageGallery(item.images),
      createdAt: item.created_at,
      date: item.created_at.slice(0, 10),
    });
  }
  return appendSiteProgress([], progress);
}

export function appendSiteProgress(
  current: SiteProgressItem[],
  incoming: SiteProgressItem[],
): SiteProgressItem[] {
  const unique = new Map<string, SiteProgressItem>();
  for (const item of [...current, ...incoming]) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()].sort((first, second) =>
    second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id));
}

function validDate(value: string) {
  return value.length <= 80 && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
