import {
  PROJECT_TABLE_DEFAULT_PAGE_SIZE,
  PROJECT_TABLE_MAX_PAGE_SIZE,
  PROJECT_TABLE_MIN_PAGE_SIZE,
} from "./project-list-page-size";

export const PROJECT_LIST_PAGE_SIZE_COOKIE = "gooes_project_list_page_size";
export const PROJECT_LIST_PAGE_SIZE_STORAGE_KEY = "gooes:project-list:page-size";
export const PROJECT_LIST_PAGE_SIZE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type PageSizeStorage = Pick<Storage, "setItem">;
type PageSizeDocument = Pick<Document, "cookie">;

export function normalizeProjectListPreferredPageSize(
  value: string | number | null | undefined,
  fallback = PROJECT_TABLE_DEFAULT_PAGE_SIZE,
) {
  const parsedValue = typeof value === "number" ? value : Number(value);
  const parsedFallback = Number(fallback);
  const pageSize = Number.isFinite(parsedValue) ? parsedValue : parsedFallback;
  const safePageSize = Number.isFinite(pageSize)
    ? pageSize
    : PROJECT_TABLE_DEFAULT_PAGE_SIZE;

  return Math.min(
    PROJECT_TABLE_MAX_PAGE_SIZE,
    Math.max(PROJECT_TABLE_MIN_PAGE_SIZE, Math.floor(safePageSize)),
  );
}

export function persistProjectListPageSize(
  pageSize: number,
  options: {
    storage?: PageSizeStorage | null;
    document?: PageSizeDocument | null;
  } = {},
) {
  const normalizedPageSize = normalizeProjectListPreferredPageSize(pageSize);
  const storage = options.storage ?? (
    typeof window === "undefined" ? null : window.localStorage
  );
  const documentLike = options.document ?? (
    typeof document === "undefined" ? null : document
  );

  storage?.setItem(PROJECT_LIST_PAGE_SIZE_STORAGE_KEY, String(normalizedPageSize));
  if (documentLike) {
    documentLike.cookie = [
      `${PROJECT_LIST_PAGE_SIZE_COOKIE}=${normalizedPageSize}`,
      "Path=/",
      `Max-Age=${PROJECT_LIST_PAGE_SIZE_COOKIE_MAX_AGE}`,
      "SameSite=Lax",
    ].join("; ");
  }
}
