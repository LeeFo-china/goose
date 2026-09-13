import { normalizeMaterialUuid } from "./material-uuid";
import { ApiClient, ApiRequestError } from "./request";

export const RENDERING_SPACES = ["living_room", "bedroom"] as const;
export const RENDERING_STYLES = [
  "modern_simple", "cream", "new_chinese", "nordic", "light_luxury",
  "natural_wood", "american", "french", "wabi_sabi",
] as const;
export const RENDERING_SOURCES = ["real_case", "design", "ai_concept"] as const;

export type RenderingSpace = (typeof RENDERING_SPACES)[number];
export type RenderingStyle = (typeof RENDERING_STYLES)[number];
export type RenderingSource = (typeof RENDERING_SOURCES)[number];

export type PublishedRenderingStyle = {
  id: string;
  title: string;
  space: RenderingSpace;
  style: RenderingStyle;
  color_notes: string;
  material_notes: string;
  source_type: RenderingSource;
  image_url: string;
  published_at: string;
};

export type PublishedRenderingPage = {
  list: PublishedRenderingStyle[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type RenderingListQuery = {
  page: number;
  pageSize: number;
  space?: RenderingSpace;
  style?: RenderingStyle;
};

export async function fetchPublishedStyles(
  client: ApiClient,
  query: RenderingListQuery,
): Promise<PublishedRenderingPage> {
  if (!Number.isInteger(query.page) || query.page < 1 || query.page > 100_000
    || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100
    || (query.space !== undefined && !isOneOf(query.space, RENDERING_SPACES))
    || (query.style !== undefined && !isOneOf(query.style, RENDERING_STYLES))) {
    throw new ApiRequestError(0, "INVALID_RENDERING_QUERY", "素材筛选条件无效");
  }
  const parameters = [`page=${query.page}`, `pageSize=${query.pageSize}`];
  if (query.space) parameters.push(`space=${query.space}`);
  if (query.style) parameters.push(`style=${query.style}`);
  const value = await client.request<unknown>({
    method: "GET",
    path: `/douyin-mini/renderings/styles?${parameters.join("&")}`,
  });
  const page = parsePublishedPage(value);
  if (!page || page.pagination.page !== query.page
    || page.pagination.pageSize !== query.pageSize) throw invalidResponse();
  return page;
}

export async function fetchPublishedStyleDetail(
  client: ApiClient,
  id: string,
): Promise<PublishedRenderingStyle> {
  const normalizedId = normalizeMaterialUuid(id);
  if (!normalizedId) throw new ApiRequestError(0, "INVALID_RENDERING_ID", "素材编号无效");
  const value = await client.request<unknown>({
    method: "GET",
    path: `/douyin-mini/renderings/styles/${encodeURIComponent(normalizedId)}`,
  });
  const style = parsePublishedStyle(value);
  if (!style || style.id.toLowerCase() !== normalizedId) throw invalidResponse();
  return style;
}

function parsePublishedPage(value: unknown): PublishedRenderingPage | null {
  if (!isRecord(value) || !Array.isArray(value.list) || value.list.length > 100
    || !isRecord(value.pagination)) return null;
  const list = value.list.map(parsePublishedStyle);
  if (!list.every((item): item is PublishedRenderingStyle => item !== null)) return null;
  const { page, pageSize, total, totalPages } = value.pagination;
  if (!isIntegerInRange(page, 1, 100_000) || !isIntegerInRange(pageSize, 1, 100)
    || !isIntegerInRange(total, 0, Number.MAX_SAFE_INTEGER)
    || !isIntegerInRange(totalPages, 0, Number.MAX_SAFE_INTEGER)
    || list.length > pageSize || list.length > total
    || totalPages !== Math.ceil(total / pageSize)) return null;
  return { list, pagination: { page, pageSize, total, totalPages } };
}

function parsePublishedStyle(value: unknown): PublishedRenderingStyle | null {
  if (!isRecord(value) || typeof value.id !== "string" || !normalizeMaterialUuid(value.id)
    || !isBoundedText(value.title, 1, 80)
    || !isOneOf(value.space, RENDERING_SPACES)
    || !isOneOf(value.style, RENDERING_STYLES)
    || !isBoundedText(value.color_notes, 0, 300)
    || !isBoundedText(value.material_notes, 0, 300)
    || !isOneOf(value.source_type, RENDERING_SOURCES)
    || typeof value.image_url !== "string"
    || !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value.image_url)
    || typeof value.published_at !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(value.published_at)
    || !Number.isFinite(Date.parse(value.published_at))) return null;
  return {
    id: value.id,
    title: value.title,
    space: value.space,
    style: value.style,
    color_notes: value.color_notes,
    material_notes: value.material_notes,
    source_type: value.source_type,
    image_url: value.image_url,
    published_at: value.published_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<const T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

function isBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "装修效果素材数据无效");
}
