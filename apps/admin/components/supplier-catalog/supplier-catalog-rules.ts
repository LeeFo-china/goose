import type {
  CatalogBaseUnit,
  CatalogCreateIntent,
  CatalogRecordKind,
  CatalogStatus,
  CatalogView,
  CategoryReturnState,
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

export function decodeCategoryTrail(
  value: string | undefined,
): CategoryTrailItem[] {
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
      const returnState = "returnState" in item
        ? parseCategoryReturnState(item.returnState)
        : undefined;
      return name ? [{
        id: item.id,
        name,
        ...(returnState ? { returnState } : {}),
      }] : [];
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
  const current = trail.at(-1);
  const parentTrail = trail.slice(0, -1);
  if (!current?.returnState) return categoryTrailHref(parentTrail);
  const query = new URLSearchParams();
  if (parentTrail.length) {
    query.set("view", "categories");
    query.set("categoryPath", encodeCategoryTrail(parentTrail));
  }
  if (current.returnState.page > 1) {
    query.set("page", String(current.returnState.page));
  }
  query.set("pageSize", String(current.returnState.pageSize));
  if (current.returnState.keyword) {
    query.set("keyword", current.returnState.keyword);
  }
  if (current.returnState.status) {
    query.set("status", current.returnState.status);
  }
  const value = query.toString();
  return value ? `/platform/catalog?${value}` : "/platform/catalog";
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

export function mergePinnedBaseUnit(
  candidates: CatalogBaseUnit[],
  pinned: CatalogBaseUnit | null,
) {
  if (!pinned || candidates.some((item) => item.id === pinned.id)) {
    return candidates;
  }
  return [pinned, ...candidates];
}

export function resolveCatalogCreateIntent(
  current: CatalogCreateIntent | null,
  payload: Record<string, unknown>,
  keyFactory: () => string,
): CatalogCreateIntent {
  const fingerprint = stableFingerprint(payload);
  if (current?.fingerprint === "") return { ...current, fingerprint };
  return current?.fingerprint === fingerprint
    ? current
    : { key: keyFactory(), fingerprint };
}

export function initializeCatalogCreateIntent(
  keyFactory: () => string,
): CatalogCreateIntent {
  return { key: keyFactory(), fingerprint: "" };
}

export function validateConversionFactor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return "换算系数必须是不含指数的十进制数";
  }
  const [rawInteger = "", fraction = ""] = normalized.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  if (integer.length > 12) return "换算系数整数部分不能超过 12 位";
  if (fraction.length > 6) return "换算系数小数部分不能超过 6 位";
  if (integer.length + fraction.length > 18) {
    return "换算系数总精度不能超过 18 位";
  }
  if (!/[1-9]/.test(`${integer}${fraction}`)) {
    return "换算系数必须大于 0";
  }
  return null;
}

function stableFingerprint(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableFingerprint(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) =>
        `${JSON.stringify(key)}:${stableFingerprint(item)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseCategoryReturnState(
  value: unknown,
): CategoryReturnState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (
    typeof input.page !== "number" ||
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    typeof input.pageSize !== "number" ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 100 ||
    typeof input.keyword !== "string" ||
    input.keyword.length > 80 ||
    !(
      input.status === "" ||
      input.status === "active" ||
      input.status === "inactive"
    )
  ) {
    return undefined;
  }
  return {
    page: input.page,
    pageSize: input.pageSize,
    keyword: input.keyword,
    status: input.status as CategoryReturnState["status"],
  };
}
