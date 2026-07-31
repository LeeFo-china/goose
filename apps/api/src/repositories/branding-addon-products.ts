import { Errors } from "@/errors/error-factory";
import { BRANDING_ADDON_PRODUCT_CODE } from "@/services/branding-addon-contracts";
import { SupabaseDB } from "@/utils/supabase";
import type { BrandingPurchaseMode } from "@gooes/domain";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type ProductQuery = {
  select(columns: string): ProductQuery;
  eq(column: string, value: unknown): ProductQuery;
  maybeSingle(): Promise<QueryResult>;
};

type ProductClient = {
  from(table: "platform_addon_products"): ProductQuery;
};

export type BrandingAddonProductRecord = {
  id: string;
  code: typeof BRANDING_ADDON_PRODUCT_CODE;
  entitlement_code: "custom_support_branding";
  name: string;
  amount_fen: number | null;
  term_years: 1;
  purchase_notes: string;
  refund_policy: string;
  enabled: boolean;
  purchase_mode: BrandingPurchaseMode;
  version: number;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

const PRODUCT_COLUMNS = [
  "id",
  "code",
  "entitlement_code",
  "name",
  "amount_fen",
  "term_years",
  "purchase_notes",
  "refund_policy",
  "enabled",
  "purchase_mode",
  "version",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export class BrandingAddonProductRepository {
  constructor(
    private readonly clientProvider: () => ProductClient = () =>
      SupabaseDB.getAdminClient() as unknown as ProductClient,
  ) {}

  async getProduct() {
    const { data, error } = await this.clientProvider()
      .from("platform_addon_products")
      .select(PRODUCT_COLUMNS)
      .eq("code", BRANDING_ADDON_PRODUCT_CODE)
      .maybeSingle();
    if (error) throw Errors.dbError("查询年度品牌权益商品失败");
    return (data as BrandingAddonProductRecord | null) ?? null;
  }

}

export const brandingAddonProductRepository =
  new BrandingAddonProductRepository();
