import type { CatalogStatus } from "@/components/supplier-catalog/supplier-catalog-types";

import type {
  TenantCatalogView,
  UnitSuggestionStatus,
} from "./tenant-catalog-types";

type TenantListStatus = CatalogStatus | UnitSuggestionStatus | "";

function command(path: string, method: "POST" | "PATCH", payload: object, key: string) {
  return {
    path,
    init: {
      method,
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(payload),
    },
  } as const;
}

export function buildTenantCatalogListPath(input: {
  view: TenantCatalogView;
  page: number;
  pageSize: number;
  keyword: string;
  status: TenantListStatus;
  parentId: string | null;
}) {
  const query = new URLSearchParams({
    page: String(Math.max(1, input.page)),
    pageSize: String(Math.min(100, Math.max(1, input.pageSize))),
  });
  if (input.view !== "unit-suggestions" && input.keyword.trim()) {
    query.set("keyword", input.keyword.trim().slice(0, 80));
  }
  if (input.status) query.set("status", input.status);
  if (input.view === "categories" && input.parentId) {
    query.set("parent_id", input.parentId);
  }
  return `/catalog/${input.view}?${query.toString()}`;
}

export function buildTenantCategoryCommand(input: {
  id?: string;
  payload: object;
  idempotencyKey: string;
}) {
  return command(
    input.id ? `/catalog/categories/${input.id}` : "/catalog/categories",
    input.id ? "PATCH" : "POST",
    input.payload,
    input.idempotencyKey,
  );
}

export function buildTenantBrandCommand(input: {
  id?: string;
  payload: object;
  idempotencyKey: string;
}) {
  return command(
    input.id ? `/catalog/brands/${input.id}` : "/catalog/brands",
    input.id ? "PATCH" : "POST",
    input.payload,
    input.idempotencyKey,
  );
}

export function buildTenantSpecListPath(
  categoryId: string,
  page: number,
  pageSize: number,
  status: CatalogStatus | "",
) {
  const query = new URLSearchParams({
    page: String(Math.max(1, page)),
    pageSize: String(Math.min(100, Math.max(1, pageSize))),
  });
  if (status) query.set("status", status);
  return `/catalog/categories/${categoryId}/spec-definitions?${query}`;
}

export function buildTenantSpecCommand(input: {
  categoryId: string;
  definitionId?: string;
  payload: object;
  idempotencyKey: string;
}) {
  const basePath = `/catalog/categories/${input.categoryId}/spec-definitions`;
  return command(
    input.definitionId ? `${basePath}/${input.definitionId}` : basePath,
    input.definitionId ? "PATCH" : "POST",
    input.payload,
    input.idempotencyKey,
  );
}

export function buildTenantCopySpecsCommand(input: {
  categoryId: string;
  platformCategoryId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return command(
    `/catalog/categories/${input.categoryId}/spec-definitions:copy-platform`,
    "POST",
    {
      platform_category_id: input.platformCategoryId,
      expected_version: input.expectedVersion,
    },
    input.idempotencyKey,
  );
}

export function buildTenantUnitSuggestionCommand(
  payload: object,
  idempotencyKey: string,
) {
  return command("/catalog/unit-suggestions", "POST", payload, idempotencyKey);
}
