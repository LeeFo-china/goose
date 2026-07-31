import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type VirtualProductQuery = {
  select(columns: string): VirtualProductQuery;
  insert(input: Record<string, unknown>): VirtualProductQuery;
  update(input: Record<string, unknown>): VirtualProductQuery;
  eq(column: string, value: unknown): VirtualProductQuery;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};

type VirtualProductClient = {
  from(table: "platform_virtual_payment_products"): VirtualProductQuery;
};

export type BrandingVirtualProductStatus = "draft" | "active" | "disabled";
export type BrandingVirtualProductValidationStatus =
  | "pending"
  | "valid"
  | "invalid";
export type BrandingVirtualPaymentSecretSettingKey =
  | "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"
  | "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE";

export type BrandingVirtualProductRecord = {
  id: string;
  addon_product_id: string;
  provider: "wechat_virtual";
  environment: BrandingVirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  provider_product_id: string;
  goods_quantity: 1;
  expected_amount_fen: number;
  encrypted_secret_ref: BrandingVirtualPaymentSecretSettingKey;
  secret_revision: number;
  status: BrandingVirtualProductStatus;
  validation_status: BrandingVirtualProductValidationStatus;
  validated_at: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveBrandingVirtualProductInput = {
  addonProductId: string;
  environment: BrandingVirtualPaymentEnvironment;
  appId: string;
  virtualMerchantId: string;
  offerId: string;
  providerProductId: string;
  expectedAmountFen: number;
  encryptedSecretRef: BrandingVirtualPaymentSecretSettingKey;
  secretRevision: number;
  status: BrandingVirtualProductStatus;
  updatedByEmployeeId: string;
};

export type UpdateBrandingVirtualProductInput =
  SaveBrandingVirtualProductInput & {
    id: string;
    expectedVersion: number;
  };

const VIRTUAL_PRODUCT_COLUMNS = [
  "id",
  "addon_product_id",
  "provider",
  "environment",
  "app_id",
  "virtual_merchant_id",
  "offer_id",
  "provider_product_id",
  "goods_quantity",
  "expected_amount_fen",
  "encrypted_secret_ref",
  "secret_revision",
  "status",
  "validation_status",
  "validated_at",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

export class BrandingVirtualProductRepository {
  constructor(
    private readonly clientProvider: () => VirtualProductClient = () =>
      SupabaseDB.getAdminClient() as unknown as VirtualProductClient,
  ) {}

  async findByProductAndEnvironment(input: {
    addonProductId: string;
    environment: BrandingVirtualPaymentEnvironment;
  }) {
    const { data, error } = await this.clientProvider()
      .from("platform_virtual_payment_products")
      .select(VIRTUAL_PRODUCT_COLUMNS)
      .eq("addon_product_id", input.addonProductId)
      .eq("environment", input.environment)
      .maybeSingle();
    if (error) {
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
    return (data as BrandingVirtualProductRecord | null) ?? null;
  }

  async createMapping(input: SaveBrandingVirtualProductInput) {
    const { data, error } = await this.clientProvider()
      .from("platform_virtual_payment_products")
      .insert(toPersistence(input, {
        version: 1,
        created_by: input.updatedByEmployeeId,
        updated_by: input.updatedByEmployeeId,
      }))
      .select(VIRTUAL_PRODUCT_COLUMNS)
      .single();
    if (error) throw Errors.dbError("创建品牌权益虚拟商品映射失败");
    return data as BrandingVirtualProductRecord;
  }

  async updateMapping(input: UpdateBrandingVirtualProductInput) {
    const { data, error } = await this.clientProvider()
      .from("platform_virtual_payment_products")
      .update(toPersistence(input, {
        version: input.expectedVersion + 1,
        updated_by: input.updatedByEmployeeId,
      }))
      .eq("id", input.id)
      .eq("addon_product_id", input.addonProductId)
      .eq("environment", input.environment)
      .eq("version", input.expectedVersion)
      .select(VIRTUAL_PRODUCT_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("更新品牌权益虚拟商品映射失败");
    return (data as BrandingVirtualProductRecord | null) ?? null;
  }
}

function toPersistence(
  input: SaveBrandingVirtualProductInput,
  auditFields: Record<string, unknown>,
) {
  return {
    addon_product_id: input.addonProductId,
    provider: "wechat_virtual",
    environment: input.environment,
    app_id: input.appId,
    virtual_merchant_id: input.virtualMerchantId,
    offer_id: input.offerId,
    provider_product_id: input.providerProductId,
    goods_quantity: 1,
    expected_amount_fen: input.expectedAmountFen,
    encrypted_secret_ref: input.encryptedSecretRef,
    secret_revision: input.secretRevision,
    status: input.status,
    ...auditFields,
  };
}

export const brandingVirtualProductRepository =
  new BrandingVirtualProductRepository();
