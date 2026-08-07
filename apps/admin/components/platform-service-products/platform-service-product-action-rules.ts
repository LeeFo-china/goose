import type {
  PlatformServiceProductListItem,
  PlatformServiceProductVersionView,
} from "./platform-service-product-types";

const ALL_CONFIRMATION_FIELDS = [
  "套餐名称",
  "服务年限",
  "标价",
  "实付价",
  "服务范围",
  "服务条款",
] as const;

export function getPlatformServiceProductChangedFields(
  product: PlatformServiceProductListItem,
): string[] {
  const published = product.published;
  if (!published) return [...ALL_CONFIRMATION_FIELDS];

  const draft = product.draft;
  const fields: string[] = [];
  if (draft.title !== published.title) fields.push("套餐名称");
  if (draft.term_years !== published.term_years) fields.push("服务年限");
  if (draft.list_amount_fen !== published.list_amount_fen) fields.push("标价");
  if (draft.amount_fen !== published.amount_fen) fields.push("实付价");
  if (!areStringListsEqual(draft.service_scope, published.service_scope)) {
    fields.push("服务范围");
  }
  if (hasTermsChanged(draft, published)) fields.push("服务条款");
  return fields;
}

export function getNextPublishedVersion(
  product: PlatformServiceProductListItem,
): number {
  return product.version + 1;
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function hasTermsChanged(
  draft: PlatformServiceProductVersionView,
  published: PlatformServiceProductVersionView,
): boolean {
  return draft.terms_version !== published.terms_version
    || draft.terms_content !== published.terms_content;
}
