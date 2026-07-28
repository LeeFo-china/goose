import { Errors } from "@/errors/error-factory";
import { BRANDING_ADDON_PRODUCT_CODE } from "@/services/branding-addon-contracts";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type ProductQuery = {
  select(columns: string): ProductQuery;
  update(patch: Record<string, unknown>): ProductQuery;
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
  version: number;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UpdateBrandingAddonProductInput = {
  name?: string;
  amountFen?: number;
  purchaseNotes?: string;
  enabled?: boolean;
  expectedVersion: number;
  updatedByEmployeeId: string;
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
    if (error) throw Errors.dbError("查询年度品牌权益商品失败", error);
    return (data as BrandingAddonProductRecord | null) ?? null;
  }

  async updateProduct(input: UpdateBrandingAddonProductInput) {
    const patch: Record<string, unknown> = {
      version: input.expectedVersion + 1,
      updated_by_employee_id: input.updatedByEmployeeId,
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.amountFen !== undefined) patch.amount_fen = input.amountFen;
    if (input.purchaseNotes !== undefined) {
      patch.purchase_notes = input.purchaseNotes;
    }
    if (input.enabled !== undefined) patch.enabled = input.enabled;

    const { data, error } = await this.clientProvider()
      .from("platform_addon_products")
      .update(patch)
      .eq("code", BRANDING_ADDON_PRODUCT_CODE)
      .eq("version", input.expectedVersion)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("更新年度品牌权益商品失败", error);
    return (data as BrandingAddonProductRecord | null) ?? null;
  }
}

export const brandingAddonProductRepository =
  new BrandingAddonProductRepository();
