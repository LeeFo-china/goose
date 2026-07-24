import { requestBackendJson } from "@/lib/backend-client";

import type {
  CatalogBaseUnit,
  CatalogCreateIntent,
  CatalogPage,
  CatalogRecordKind,
} from "./supplier-catalog-types";

type BaseUnitQuery = {
  page: number;
  pageSize: number;
  keyword: string;
};

type BaseUnitRequest = (
  path: string,
) => Promise<CatalogPage<CatalogBaseUnit>>;

export function buildBaseUnitListPath(input: BaseUnitQuery) {
  const query = new URLSearchParams();
  query.set("status", "active");
  query.set("unit_kind", "base");
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());
  return `/platform/catalog/units?${query.toString()}`;
}

export function loadBaseUnitPage(
  input: BaseUnitQuery,
  request: BaseUnitRequest = (path) =>
    requestBackendJson<CatalogPage<CatalogBaseUnit>>(path, {
      fallbackMessage: "加载基准单位失败",
    }),
) {
  return request(buildBaseUnitListPath(input));
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
