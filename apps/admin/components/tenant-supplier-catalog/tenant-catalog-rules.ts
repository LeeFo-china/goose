import type { CategoryReturnState } from "@/components/supplier-catalog/supplier-catalog-types";
import {
  CATALOG_CATEGORY_MAX_DEPTH,
  canBrowseCatalogCategoryChildren,
} from "@/components/supplier-catalog/catalog-category-depth";

import type {
  CatalogMappingOption,
  CatalogOwnershipScope,
  TenantCategoryTrailItem,
} from "./tenant-catalog-types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TENANT_CATEGORY_MAX_DEPTH = CATALOG_CATEGORY_MAX_DEPTH;

export function canBrowseTenantCategoryChildren(level: number) {
  return canBrowseCatalogCategoryChildren(level);
}

export function getTenantCatalogCapabilities(record: {
  ownership_scope: CatalogOwnershipScope;
}) {
  const isTenantOwned = record.ownership_scope === "tenant";
  return {
    canEdit: isTenantOwned,
    canChangeStatus: isTenantOwned,
    canCopySpecs: false,
  };
}

export function newTenantCatalogCommandKey(resource: string) {
  return `tenant-${resource}:${crypto.randomUUID()}`;
}

export function encodeTenantCategoryTrail(trail: TenantCategoryTrailItem[]) {
  return JSON.stringify(trail.slice(0, TENANT_CATEGORY_MAX_DEPTH));
}

export function decodeTenantCategoryTrail(
  value: string | undefined,
): TenantCategoryTrailItem[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, TENANT_CATEGORY_MAX_DEPTH).flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const input = item as Record<string, unknown>;
      const name = typeof input.name === "string"
        ? input.name.trim().slice(0, 120)
        : "";
      if (
        typeof input.id !== "string" || !UUID_PATTERN.test(input.id) ||
        !name ||
        (input.ownershipScope !== "platform" &&
          input.ownershipScope !== "tenant") ||
        typeof input.level !== "number" ||
        !Number.isSafeInteger(input.level) || input.level < 1 ||
        input.level > TENANT_CATEGORY_MAX_DEPTH
      ) return [];
      const returnState = parseReturnState(input.returnState);
      return [{
        id: input.id,
        name,
        ownershipScope: input.ownershipScope,
        level: input.level,
        ...(returnState ? { returnState } : {}),
      }];
    });
  } catch {
    return [];
  }
}

export function currentTenantCategoryParent(trail: TenantCategoryTrailItem[]) {
  return trail.at(-1)?.id ?? null;
}

export function canCreateTenantCategoryAtTrail(
  trail: TenantCategoryTrailItem[],
) {
  const parent = trail.at(-1);
  return !parent || (
    parent.ownershipScope === "tenant" &&
    parent.level < TENANT_CATEGORY_MAX_DEPTH
  );
}

export function tenantCategoryTrailHref(trail: TenantCategoryTrailItem[]) {
  if (!trail.length) return "/supplier-catalog";
  const query = new URLSearchParams({
    view: "categories",
    categoryPath: encodeTenantCategoryTrail(trail),
  });
  return `/supplier-catalog?${query}`;
}

export function tenantParentCategoryHref(trail: TenantCategoryTrailItem[]) {
  const current = trail.at(-1);
  const parentTrail = trail.slice(0, -1);
  if (!current?.returnState) return tenantCategoryTrailHref(parentTrail);
  const query = new URLSearchParams();
  if (parentTrail.length) {
    query.set("view", "categories");
    query.set("categoryPath", encodeTenantCategoryTrail(parentTrail));
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
  return value ? `/supplier-catalog?${value}` : "/supplier-catalog";
}

export function mergePinnedCatalogOption<Option extends CatalogMappingOption>(
  candidates: Option[],
  pinned: Option | null,
) {
  if (!pinned || candidates.some(({ id }) => id === pinned.id)) {
    return candidates;
  }
  return [pinned, ...candidates];
}

function parseReturnState(value: unknown): CategoryReturnState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (
    typeof input.page !== "number" || !Number.isSafeInteger(input.page) ||
    input.page < 1 || typeof input.pageSize !== "number" ||
    !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 ||
    input.pageSize > 100 || typeof input.keyword !== "string" ||
    input.keyword.length > 80 ||
    (input.status !== "" && input.status !== "active" &&
      input.status !== "inactive")
  ) return undefined;
  return {
    page: input.page,
    pageSize: input.pageSize,
    keyword: input.keyword,
    status: input.status,
  };
}
