import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";
import type { BrandingAddonProductRecord } from "./branding-addon-products";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type VirtualProductQuery = {
  select(columns: string): VirtualProductQuery;
  eq(column: string, value: unknown): VirtualProductQuery;
  order?(column: string, options: { ascending: boolean }): VirtualProductQuery;
  limit?(count: number): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
};

type VirtualProductClient = {
  from(table: "platform_virtual_payment_products"): VirtualProductQuery;
  rpc?(name: string, params: Record<string, unknown>): Promise<QueryResult>;
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

export type ManageBrandingVirtualProductConfigurationInput = {
  expectedProductVersion: number;
  productPatch: {
    name?: string;
    amount_fen?: number;
    purchase_notes?: string;
    enabled?: boolean;
    purchase_mode?: BrandingPurchaseMode;
  };
  virtualProductPatch: Record<string, unknown>;
  actorEmployeeId: string;
};

export type ManageBrandingVirtualProductConfigurationResult = {
  product: BrandingAddonProductRecord;
  virtual_product: BrandingVirtualProductRecord | null;
};

export type SetBrandingVirtualProductValidationInput = {
  addonProductId: string;
  environment: BrandingVirtualPaymentEnvironment;
  expectedProductVersion: number;
  expectedMappingVersion: number;
  validationStatus: "valid" | "invalid";
  validatedAt: string;
  updatedByEmployeeId: string;
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

  async listByProduct(addonProductId: string) {
    // A database unique constraint limits this internal auxiliary list to the
    // two supported environments, so the fixed limit is a hard safety bound.
    const query = this.clientProvider()
      .from("platform_virtual_payment_products")
      .select(VIRTUAL_PRODUCT_COLUMNS)
      .eq("addon_product_id", addonProductId);
    if (!query.order) throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    const ordered = query.order("environment", { ascending: true });
    if (!ordered.limit) throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    const { data, error } = await ordered.limit(2);
    if (error) throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    return Array.isArray(data) ? data as BrandingVirtualProductRecord[] : [];
  }

  async manageConfiguration(
    input: ManageBrandingVirtualProductConfigurationInput,
  ) {
    const client = this.clientProvider();
    if (!client.rpc) throw Errors.dbError("保存品牌权益商品配置失败");
    const { data, error } = await client.rpc(
      "branding_manage_virtual_product_configuration",
      {
        p_expected_product_version: input.expectedProductVersion,
        p_product_patch: input.productPatch,
        p_virtual_product_patch: input.virtualProductPatch,
        p_actor_employee_id: input.actorEmployeeId,
      },
    );
    if (error) throwVirtualProductCommandError(
      error,
      "保存品牌权益商品配置失败",
    );
    return data as ManageBrandingVirtualProductConfigurationResult;
  }

  async setConfigurationValidation(
    input: SetBrandingVirtualProductValidationInput,
  ) {
    const client = this.clientProvider();
    if (!client.rpc) {
      throw Errors.dbError("保存品牌权益虚拟商品验证结果失败");
    }
    const { data, error } = await client.rpc(
      "branding_set_virtual_product_configuration_validation",
      {
        p_addon_product_id: input.addonProductId,
        p_environment: input.environment,
        p_expected_product_version: input.expectedProductVersion,
        p_expected_mapping_version: input.expectedMappingVersion,
        p_validation_status: input.validationStatus,
        p_validated_at: input.validatedAt,
        p_updated_by: input.updatedByEmployeeId,
      },
    );
    if (error) throwVirtualProductCommandError(
      error,
      "保存品牌权益虚拟商品验证结果失败",
    );
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) {
      throw Errors.dbError("保存品牌权益虚拟商品验证结果失败");
    }
    return record as BrandingVirtualProductRecord;
  }

}

export const brandingVirtualProductRepository =
  new BrandingVirtualProductRepository();

const COMMAND_ERRORS: Record<string, { message: string; code: string }> = {
  BRANDING_ADDON_PRODUCT_NOT_FOUND: {
    message: "年度品牌权益商品不存在",
    code: "BRANDING_ADDON_PRODUCT_NOT_FOUND",
  },
  BRANDING_ADDON_PRODUCT_VERSION_CONFLICT: {
    message: "商品配置版本已变化，请刷新后重试",
    code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
  },
  BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT: {
    message: "虚拟商品映射版本已变化，请刷新后重试",
    code: "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
  },
  BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID: {
    message: "不支持当前商品购买模式切换",
    code: "BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID",
  },
  BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED: {
    message: "虚拟商品映射参数变化后必须重新验证",
    code: "BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED",
  },
  BRANDING_VIRTUAL_PRODUCT_INVALID: {
    message: "虚拟商品映射尚未通过验证",
    code: "BRANDING_VIRTUAL_PRODUCT_INVALID",
  },
  BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED: {
    message: "切换虚拟支付前必须配置生产环境映射",
    code: "BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED",
  },
  BRANDING_VIRTUAL_PRODUCT_DISABLED: {
    message: "生产虚拟商品映射未启用",
    code: "BRANDING_VIRTUAL_PRODUCT_DISABLED",
  },
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW: {
    message: "生产虚拟商品价格不得低于 100 分",
    code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
  },
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH: {
    message: "生产虚拟商品映射价格与业务商品不一致",
    code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
  },
  BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH: {
    message: "虚拟支付密钥引用与环境不匹配",
    code: "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
  },
};

function throwVirtualProductCommandError(
  error: unknown,
  fallbackMessage: string,
): never {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (record.code === "P0001" && typeof record.message === "string") {
      const mapped = COMMAND_ERRORS[record.message];
      if (mapped) {
        throw Errors.business(409, mapped.message, mapped.code);
      }
    }
  }
  throw Errors.dbError(fallbackMessage);
}
