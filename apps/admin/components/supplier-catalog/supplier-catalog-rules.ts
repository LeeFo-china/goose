import type {
  CatalogRecordKind,
  CatalogStatus,
  CatalogView,
  CategoryTrailItem,
} from "./supplier-catalog-types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCatalogPage(value: string | undefined) {
  const parsed = Number(value ?? "1");
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function buildCatalogListPath(input: {
  view: CatalogView;
  page: number;
  pageSize: number;
  keyword: string;
  status: CatalogStatus | "";
  parentId: string | null;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.status) query.set("status", input.status);
  if (input.view === "categories" && input.parentId) {
    query.set("parent_id", input.parentId);
  }
  return `/platform/catalog/${input.view}?${query.toString()}`;
}

export function encodeCategoryTrail(trail: CategoryTrailItem[]) {
  return JSON.stringify(trail.slice(0, 6));
}

export function decodeCategoryTrail(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 6).flatMap((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("id" in item) ||
        !("name" in item) ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        !UUID_PATTERN.test(item.id)
      ) {
        return [];
      }
      const name = item.name.trim().slice(0, 120);
      return name ? [{ id: item.id, name }] : [];
    });
  } catch {
    return [];
  }
}

export function currentCategoryParent(trail: CategoryTrailItem[]) {
  return trail.at(-1)?.id ?? null;
}

export function catalogViewHref(view: CatalogView) {
  return view === "categories"
    ? "/platform/catalog"
    : `/platform/catalog?view=${view}`;
}

export function categoryTrailHref(trail: CategoryTrailItem[]) {
  if (trail.length === 0) return "/platform/catalog";
  const query = new URLSearchParams({
    view: "categories",
    categoryPath: encodeCategoryTrail(trail),
  });
  return `/platform/catalog?${query.toString()}`;
}

export function parentCategoryHref(trail: CategoryTrailItem[]) {
  return categoryTrailHref(trail.slice(0, -1));
}

export function buildCatalogStatusRequest(input: {
  kind: CatalogRecordKind;
  id: string;
  status: CatalogStatus;
  expectedVersion: number;
}) {
  const plural = input.kind === "category"
    ? "categories"
    : input.kind === "brand"
      ? "brands"
      : "units";
  return {
    path: `/platform/catalog/${plural}/${input.id}`,
    init: {
      method: "PATCH",
      body: JSON.stringify({
        expected_version: input.expectedVersion,
        status: input.status,
      }),
    },
  } as const;
}

export function isCatalogVersionConflict(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { status?: unknown; code?: unknown };
  return value.status === 409 && value.code === "SUPPLIER_VERSION_CONFLICT";
}

export function resolveCatalogStatusRetry(input: {
  requestedStatus: CatalogStatus;
  latestStatus: CatalogStatus;
}) {
  return input.requestedStatus === input.latestStatus
    ? "already-applied"
    : "retry";
}

export function buildUnitRelationshipPayload(input: {
  mode: "base" | "derived";
  baseUnitId: string;
  conversionFactor: string;
}) {
  return input.mode === "base"
    ? { base_unit_id: null, conversion_factor: "1" }
    : {
        base_unit_id: input.baseUnitId,
        conversion_factor: input.conversionFactor.trim(),
      };
}

export function newCatalogIdempotencyKey(kind: CatalogRecordKind) {
  return `catalog-${kind}:${crypto.randomUUID()}`;
}
