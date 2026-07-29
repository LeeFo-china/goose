export interface PlatformBrandingAddonProduct {
  code: string;
  entitlement_code: string;
  name: string;
  amount_fen: number | null;
  term_years: number;
  purchase_notes: string;
  enabled: boolean;
  version: number;
}

export interface PlatformBrandingAddonProductResult {
  product: PlatformBrandingAddonProduct;
}

export interface PlatformBrandingAddonProductFormValues {
  name: string;
  amountYuan: string;
  purchaseNotes: string;
  enabled: boolean;
}

export interface PlatformBrandingAddonProductPatch {
  name: string;
  amount_fen: number;
  purchase_notes: string;
  enabled: boolean;
  version: number;
}
