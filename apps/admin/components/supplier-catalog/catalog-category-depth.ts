export const CATALOG_CATEGORY_MAX_DEPTH = 8;

export function canBrowseCatalogCategoryChildren(level: number) {
  return Number.isSafeInteger(level) &&
    level >= 1 &&
    level < CATALOG_CATEGORY_MAX_DEPTH;
}
