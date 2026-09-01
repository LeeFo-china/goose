import type {
  DouyinMaterialNoteBlock,
  DouyinMaterialNoteClaimResponse,
  DouyinMaterialNoteClaimedMaterial,
  DouyinMaterialNoteOwnedDetail,
  DouyinMaterialNoteOwnedPage,
  DouyinMaterialNoteOwnedSummary,
  DouyinMaterialNotePreview,
  DouyinMaterialNotePublicPage,
  PaginationMeta,
} from "../models";
import { ApiClient, ApiRequestError } from "./request";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CONTENT_BYTES = 512 * 1024;
const MATERIAL_BUSINESS_ERROR_CODES = [
  "MATERIAL_NOTE_NOT_FOUND",
  "MATERIAL_NOTE_NOT_AVAILABLE",
  "MATERIAL_NOTE_WITHDRAWN",
  "MATERIAL_NOTE_CLAIM_NOT_FOUND",
  "MATERIAL_NOTE_VERSION_CONFLICT",
  "MATERIAL_NOTE_STATE_CONFLICT",
] as const;

export type MaterialListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type MaterialBusinessErrorCode =
  (typeof MATERIAL_BUSINESS_ERROR_CODES)[number];

export type MaterialBusinessError = {
  statusCode: number;
  code: MaterialBusinessErrorCode;
  message: string;
};

export async function fetchMaterials(
  client: ApiClient,
  query: MaterialListQuery = {},
): Promise<DouyinMaterialNotePublicPage> {
  const normalized = normalizeQuery(query, true);
  const value = await client.request<unknown>({
    path: `/douyin-mini/material-notes?${buildQuery(normalized)}`,
    method: "GET",
  });
  const result = parsePage(value, parsePreview);
  if (!result || !matchesQuery(result.pagination, normalized)) throw invalidResponse();
  return result;
}

export async function fetchMaterialPreview(
  client: ApiClient,
  noteId: string,
): Promise<DouyinMaterialNotePreview> {
  validateId(noteId);
  const value = await client.request<unknown>({
    path: `/douyin-mini/material-notes/${encodeURIComponent(noteId)}`,
    method: "GET",
  });
  const result = parsePreview(value);
  if (!result || result.id !== noteId) throw invalidResponse();
  return result;
}

export async function claimMaterial(
  client: ApiClient,
  noteId: string,
): Promise<DouyinMaterialNoteClaimResponse> {
  validateId(noteId);
  const value = await client.request<unknown>({
    path: `/douyin-mini/material-notes/${encodeURIComponent(noteId)}/claim`,
    method: "POST",
  });
  const result = parseClaimResponse(value);
  if (!result || result.material.id !== noteId) throw invalidResponse();
  return result;
}

export async function fetchOwnedMaterials(
  client: ApiClient,
  query: MaterialListQuery = {},
): Promise<DouyinMaterialNoteOwnedPage> {
  const normalized = normalizeQuery(query, false);
  const value = await client.request<unknown>({
    path: `/douyin-mini/my-material-notes?${buildQuery(normalized)}`,
    method: "GET",
  });
  const result = parsePage(value, parseOwnedSummary);
  if (!result || !matchesQuery(result.pagination, normalized)) throw invalidResponse();
  return result;
}

export async function fetchOwnedMaterialDetail(
  client: ApiClient,
  claimId: string,
): Promise<DouyinMaterialNoteOwnedDetail> {
  validateId(claimId);
  const value = await client.request<unknown>({
    path: `/douyin-mini/my-material-notes/${encodeURIComponent(claimId)}`,
    method: "GET",
  });
  const result = parseOwnedDetail(value);
  if (!result || result.claim_id !== claimId) throw invalidResponse();
  return result;
}

export async function removeOwnedMaterial(
  client: ApiClient,
  claimId: string,
): Promise<{ removed: true }> {
  validateId(claimId);
  const value = await client.request<unknown>({
    path: `/douyin-mini/my-material-notes/${encodeURIComponent(claimId)}/remove`,
    method: "POST",
  });
  if (!isStrictRecord(value, ["removed"]) || value.removed !== true) throw invalidResponse();
  return { removed: true };
}

export async function clearOwnedMaterials(
  client: ApiClient,
): Promise<{ removed_count: number }> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/my-material-notes/clear",
    method: "POST",
  });
  if (!isStrictRecord(value, ["removed_count"])
    || !isIntegerInRange(value.removed_count, 0, Number.MAX_SAFE_INTEGER)) {
    throw invalidResponse();
  }
  return { removed_count: value.removed_count };
}

export function toMaterialBusinessError(error: unknown): MaterialBusinessError | null {
  if (!(error instanceof ApiRequestError) || !isMaterialBusinessErrorCode(error.code)) {
    return null;
  }
  return { statusCode: error.statusCode, code: error.code, message: error.message };
}

type NormalizedQuery = { page: number; pageSize: number; keyword?: string };

function normalizeQuery(query: MaterialListQuery, allowKeyword: boolean): NormalizedQuery {
  const allowedKeys = allowKeyword
    ? ["page", "pageSize", "keyword"]
    : ["page", "pageSize"];
  if (!isRecord(query) || Object.keys(query).some((key) => !allowedKeys.includes(key))) {
    throw invalidQuery();
  }
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  if (!isIntegerInRange(page, 1, 10_000) || !isIntegerInRange(pageSize, 1, 100)) {
    throw invalidQuery();
  }
  if (query.keyword === undefined) return { page, pageSize };
  const keyword = query.keyword.trim();
  if (!allowKeyword || keyword.length < 1 || keyword.length > 120) throw invalidQuery();
  return { page, pageSize, keyword };
}

function buildQuery(query: NormalizedQuery): string {
  const parameters = [`page=${query.page}`, `pageSize=${query.pageSize}`];
  if (query.keyword) parameters.push(`keyword=${encodeURIComponent(query.keyword)}`);
  return parameters.join("&");
}

function matchesQuery(pagination: PaginationMeta, query: NormalizedQuery): boolean {
  return pagination.page === query.page && pagination.pageSize === query.pageSize;
}

function parsePage<Item>(
  value: unknown,
  parseItem: (value: unknown) => Item | null,
): { list: Item[]; pagination: PaginationMeta } | null {
  if (!isStrictRecord(value, ["list", "pagination"])
    || !Array.isArray(value.list) || value.list.length > 100) return null;
  const list = value.list.map(parseItem);
  const pagination = parsePagination(value.pagination, list.length);
  return pagination && list.every((item): item is Item => item !== null)
    ? { list, pagination }
    : null;
}

function parsePagination(value: unknown, itemCount: number): PaginationMeta | null {
  if (!isStrictRecord(value, ["page", "pageSize", "total", "totalPages"])) return null;
  const { page, pageSize, total, totalPages } = value;
  if (!isIntegerInRange(page, 1, 10_000) || !isIntegerInRange(pageSize, 1, 100)
    || !isIntegerInRange(total, 0, 10_000_000) || !isIntegerInRange(totalPages, 0, 10_000)
    || itemCount > pageSize || itemCount > total) return null;
  const expectedPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  if (totalPages !== expectedPages) return null;
  if (total === 0) return itemCount === 0 ? { page, pageSize, total, totalPages } : null;
  if (page > expectedPages) return itemCount === 0 ? { page, pageSize, total, totalPages } : null;
  const expectedItems = Math.min(pageSize, total - (page - 1) * pageSize);
  return itemCount === expectedItems ? { page, pageSize, total, totalPages } : null;
}

function parsePreview(value: unknown): DouyinMaterialNotePreview | null {
  if (!isStrictRecord(value, [
    "id", "title", "summary", "category", "applicable_to", "published_at", "claimed",
  ])) return null;
  const common = parseCommon(value);
  const publishedAt = parseDateTime(value.published_at);
  if (!common || !publishedAt || typeof value.claimed !== "boolean") return null;
  return { id: common.id, ...common.content, published_at: publishedAt, claimed: value.claimed };
}

function parseClaimResponse(value: unknown): DouyinMaterialNoteClaimResponse | null {
  if (!isStrictRecord(value, ["claim_id", "already_claimed", "claimed_at", "material"])) {
    return null;
  }
  const material = parseClaimedMaterial(value.material);
  const claimedAt = parseDateTime(value.claimed_at);
  return typeof value.claim_id === "string" && UUID_PATTERN.test(value.claim_id)
    && typeof value.already_claimed === "boolean" && claimedAt && material
    ? {
      claim_id: value.claim_id,
      already_claimed: value.already_claimed,
      claimed_at: claimedAt,
      material,
    }
    : null;
}

function parseClaimedMaterial(value: unknown): DouyinMaterialNoteClaimedMaterial | null {
  if (!isStrictRecord(value, [
    "id", "version", "title", "summary", "category", "applicable_to", "content_blocks",
  ])) return null;
  const common = parseCommon(value);
  const blocks = parseBlocks(value.content_blocks);
  return common && isIntegerInRange(value.version, 1, Number.MAX_SAFE_INTEGER) && blocks
    ? { id: common.id, version: value.version, ...common.content, content_blocks: blocks }
    : null;
}

function parseOwnedSummary(value: unknown): DouyinMaterialNoteOwnedSummary | null {
  if (!isStrictRecord(value, [
    "claim_id", "id", "version", "title", "summary", "category", "applicable_to", "claimed_at",
  ])) return null;
  const common = parseCommon(value);
  const claimedAt = parseDateTime(value.claimed_at);
  return common && typeof value.claim_id === "string" && UUID_PATTERN.test(value.claim_id)
    && isIntegerInRange(value.version, 1, Number.MAX_SAFE_INTEGER) && claimedAt
    ? {
      claim_id: value.claim_id,
      id: common.id,
      version: value.version,
      ...common.content,
      claimed_at: claimedAt,
    }
    : null;
}

function parseOwnedDetail(value: unknown): DouyinMaterialNoteOwnedDetail | null {
  if (!isStrictRecord(value, [
    "claim_id", "id", "version", "title", "summary", "category", "applicable_to",
    "claimed_at", "content_blocks",
  ])) return null;
  const summary = parseOwnedSummary({
    claim_id: value.claim_id,
    id: value.id,
    version: value.version,
    title: value.title,
    summary: value.summary,
    category: value.category,
    applicable_to: value.applicable_to,
    claimed_at: value.claimed_at,
  });
  const blocks = parseBlocks(value.content_blocks);
  return summary && blocks ? { ...summary, content_blocks: blocks } : null;
}

function parseCommon(value: Record<string, unknown>): {
  id: string;
  content: Pick<DouyinMaterialNotePreview, "title" | "summary" | "category" | "applicable_to">;
} | null {
  const title = boundedText(value.title, 1, 300);
  const summary = boundedText(value.summary, 1, 1_000);
  const category = boundedText(value.category, 1, 100);
  let applicableTo: string | null = null;
  if (value.applicable_to !== null) {
    applicableTo = boundedText(value.applicable_to, 1, 300);
    if (!applicableTo) return null;
  }
  if (typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || !title || !summary || !category) return null;
  return {
    id: value.id,
    content: { title, summary, category, applicable_to: applicableTo },
  };
}

function parseBlocks(value: unknown): DouyinMaterialNoteBlock[] | null {
  if (!Array.isArray(value) || value.length > 100
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CONTENT_BYTES) return null;
  const blocks = value.map(parseBlock);
  return blocks.every((block): block is DouyinMaterialNoteBlock => block !== null)
    ? blocks
    : null;
}

function parseBlock(value: unknown): DouyinMaterialNoteBlock | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "heading": {
      if (!isStrictRecord(value, ["type", "level", "text"])) return null;
      const text = boundedText(value.text, 1, 300);
      return text && (value.level === 2 || value.level === 3)
        ? { type: "heading", level: value.level, text }
        : null;
    }
    case "paragraph": {
      if (!isStrictRecord(value, ["type", "text"])) return null;
      const text = boundedText(value.text, 1, 20_000);
      return text ? { type: "paragraph", text } : null;
    }
    case "list": {
      if (!isStrictRecord(value, ["type", "style", "items"])
        || (value.style !== "ordered" && value.style !== "unordered")
        || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) {
        return null;
      }
      const items = value.items.map((item) => boundedText(item, 1, 2_000));
      return items.every((item): item is string => item !== null)
        ? { type: "list", style: value.style, items }
        : null;
    }
    case "quote": {
      const keys = value.attribution === undefined
        ? ["type", "text"]
        : ["type", "text", "attribution"];
      if (!isStrictRecord(value, keys)) return null;
      const text = boundedText(value.text, 1, 20_000);
      const attribution = value.attribution === undefined
        ? undefined
        : boundedText(value.attribution, 1, 300);
      return text && (value.attribution === undefined || attribution)
        ? { type: "quote", text, ...(attribution ? { attribution } : {}) }
        : null;
    }
    case "callout": {
      if (!isStrictRecord(value, ["type", "tone", "title", "text"])
        || (value.tone !== "info" && value.tone !== "warning")) return null;
      const title = boundedText(value.title, 1, 300);
      const text = boundedText(value.text, 1, 20_000);
      return title && text ? { type: "callout", tone: value.tone, title, text } : null;
    }
    default:
      return null;
  }
}

function validateId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new ApiRequestError(0, "INVALID_MATERIAL_ID", "资料编号无效");
}

function boundedText(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= minimum && text.length <= maximum ? text : null;
}

function parseDateTime(value: unknown): string | null {
  return typeof value === "string" && DATE_TIME_PATTERN.test(value)
    && Number.isFinite(Date.parse(value)) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStrictRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= minimum && value <= maximum;
}

function isMaterialBusinessErrorCode(value: string): value is MaterialBusinessErrorCode {
  return MATERIAL_BUSINESS_ERROR_CODES.includes(value as MaterialBusinessErrorCode);
}

function invalidQuery(): ApiRequestError {
  return new ApiRequestError(0, "INVALID_MATERIAL_QUERY", "资料筛选条件无效");
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "资料数据无效");
}
