import type {
  CatalogBaseUnit,
  CatalogCreateIntent,
  CatalogPage,
  CatalogRecordKind,
} from "./supplier-catalog-types";

export type BaseUnitQuery = {
  page: number;
  pageSize: number;
  keyword: string;
};

export type BaseUnitRequest = (
  path: string,
) => Promise<CatalogPage<CatalogBaseUnit>>;

type SearchKeyEvent = {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function buildBaseUnitListPath(input: BaseUnitQuery) {
  const query = new URLSearchParams();
  query.set("status", "active");
  query.set("unit_kind", "base");
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());
  return `/platform/catalog/units?${query.toString()}`;
}

export function loadBaseUnitPageWith(
  input: BaseUnitQuery,
  request: BaseUnitRequest,
) {
  return request(buildBaseUnitListPath(input));
}

export function handleBaseUnitSearchKeyDown(
  event: SearchKeyEvent,
  onSearch: () => void,
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.stopPropagation();
  onSearch();
}

export function buildCatalogMutationRequest(input: {
  kind: CatalogRecordKind;
  payload: Record<string, unknown>;
  intent: CatalogCreateIntent;
}) {
  const plural = input.kind === "category"
    ? "categories"
    : input.kind === "brand"
      ? "brands"
      : "units";
  return {
    path: `/platform/catalog/${plural}`,
    init: {
      method: "POST",
      headers: { "Idempotency-Key": input.intent.key },
      body: JSON.stringify(input.payload),
    },
  } as const;
}
