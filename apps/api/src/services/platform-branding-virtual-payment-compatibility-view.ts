import type { BrandingVirtualProductCatalogSnapshot } from
  './branding-virtual-product-compatibility';
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from './branding-virtual-products';

export function serializeCatalogConfiguration(
  snapshot: BrandingVirtualProductCatalogSnapshot,
  secretValues: Record<string, string>,
) {
  return {
    product: {
      id: snapshot.product.id,
      code: snapshot.product.code,
      entitlement_code: snapshot.product.entitlement_code,
      name: snapshot.product.name,
      amount_fen: snapshot.product.amount_fen,
      term_years: snapshot.product.term_years,
      purchase_notes: snapshot.product.purchase_notes,
      enabled: snapshot.product.enabled,
      purchase_mode: snapshot.product.purchase_mode,
      version: snapshot.product.version,
    },
    virtual_products: snapshot.mappings.map((mapping) => {
      const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[mapping.environment];
      const bundle = parseWechatVirtualPaymentSecretBundle(
        secretValues[key] ?? '',
      );
      return {
        environment: mapping.environment,
        mapping,
        secret: {
          key,
          revision: bundle?.revision ?? null,
          configured: bundle !== null,
        },
      };
    }),
  };
}
