import { Errors } from "@/errors/error-factory";
import type {
  OrderRecord,
  ProductRecord,
  ProductVersionRecord,
} from "@/repositories/platform-service-order-records";

export function requirePublishedVersion(product: ProductRecord) {
  const version = firstVersion(product.published_version);
  if (!version || !product.published_version_id) {
    throw Errors.business(
      409,
      "平台服务商品尚未发布",
      "SERVICE_PRODUCT_PUBLISH_REQUIRED",
    );
  }
  return version;
}

export function buildProductSnapshot(
  product: ProductRecord,
  version: ProductVersionRecord,
) {
  return {
    product_id: product.id,
    product_version_id: version.id,
    code: product.code,
    title: version.title,
    pricing_version: version.version,
    term_years: version.term_years,
    list_amount_fen: version.list_amount_fen,
    amount_fen: version.amount_fen,
    service_scope: version.service_scope,
    terms_version: version.terms_version,
    terms_content: version.terms_content,
  };
}

export function getOrderDescription(order: OrderRecord) {
  const snapshotTitle = typeof order.product_snapshot?.title === "string"
    ? order.product_snapshot.title.trim()
    : "";
  return snapshotTitle || order.product_code;
}

function firstVersion(
  version: ProductVersionRecord | ProductVersionRecord[] | null | undefined,
) {
  if (Array.isArray(version)) return version[0] ?? null;
  return version ?? null;
}
