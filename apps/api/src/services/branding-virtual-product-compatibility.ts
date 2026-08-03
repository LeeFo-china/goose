import type { VirtualPaymentEnvironment } from '@gooes/domain';

import { AppError } from '../errors/app-error';
import { Errors } from '../errors/error-factory';
import type { BrandingAddonProductRecord } from '../repositories/branding-addon-products';
import type {
  BrandingVirtualPaymentSecretSettingKey,
  ManageBrandingVirtualProductConfigurationInput,
  ManageBrandingVirtualProductConfigurationResult,
  BrandingVirtualProductRecord,
} from '../repositories/branding-virtual-products';
import { platformVirtualProductsRepository } from '../repositories/platform-virtual-products';
import type { PlatformVirtualProductVersionCommandInput } from '../schema/platform-virtual-products';
import type { AuthContext } from './authorization';
import { accessPolicyService } from './access-policy';
import {
  BRANDING_ADDON_PRODUCT_CODE,
  BRANDING_ADDON_REFUND_POLICY,
} from './branding-addon-contracts';
import {
  PlatformVirtualProductChannelsService,
  platformVirtualProductChannelService,
} from './platform-virtual-product-channels';

const LEGACY_MANAGE_PERMISSION = 'platform.payment.config.manage';

const SECRET_KEYS = {
  sandbox: 'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
  production: 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE',
} as const satisfies Record<
  VirtualPaymentEnvironment,
  BrandingVirtualPaymentSecretSettingKey
>;

type CatalogRepositoryPort = Pick<
  typeof platformVirtualProductsRepository,
  'findByCode' | 'manageAnnualCompatibility'
>;
type ChannelServicePort = Pick<
  typeof platformVirtualProductChannelService,
  'refresh' | 'startUpload' | 'startPublish' | 'validate'
>;

export type BrandingVirtualProductCatalogCompatibilityDependencies = {
  catalogRepository?: CatalogRepositoryPort;
  channelService?: ChannelServicePort;
};

export type BrandingVirtualProductCatalogSnapshot = {
  product: BrandingAddonProductRecord;
  mappings: BrandingVirtualProductRecord[];
};

export class BrandingVirtualProductCatalogCompatibilityService {
  private readonly catalog: CatalogRepositoryPort;
  private readonly channels: ChannelServicePort;

  constructor(
    dependencies: BrandingVirtualProductCatalogCompatibilityDependencies = {},
  ) {
    this.catalog = dependencies.catalogRepository ??
      platformVirtualProductsRepository;
    this.channels = dependencies.channelService ?? legacyChannelService;
  }

  async getSnapshot(): Promise<BrandingVirtualProductCatalogSnapshot> {
    const value = await this.catalog.findByCode(BRANDING_ADDON_PRODUCT_CODE);
    if (!value) {
      throw Errors.business(
        404,
        '年度品牌权益商品不存在',
        'BRANDING_ADDON_PRODUCT_NOT_FOUND',
      );
    }
    return normalizeCatalogSnapshot(value);
  }

  async updateConfiguration(
    input: ManageBrandingVirtualProductConfigurationInput,
  ): Promise<ManageBrandingVirtualProductConfigurationResult> {
    await this.catalog.manageAnnualCompatibility({
      expectedProductVersion: input.expectedProductVersion,
      purchaseMode: input.productPatch.purchase_mode,
      virtualProductPatch: input.virtualProductPatch,
      actorEmployeeId: input.actorEmployeeId,
    });
    const snapshot = await this.getSnapshot();
    const environment = environmentFromPatch(input.virtualProductPatch);
    return {
      product: snapshot.product,
      virtual_product: environment
        ? snapshot.mappings.find(
          (mapping) => mapping.environment === environment,
        ) ?? null
        : null,
    };
  }

  async refreshChannel(
    auth: AuthContext,
    environment: VirtualPaymentEnvironment,
  ) {
    const productId = await this.getProductId();
    const snapshot = await this.compatibilityCall(() =>
      this.channels.refresh(auth, productId, environment)
    );
    return serializeLegacyGoodsStatus(snapshot);
  }

  async startUpload(
    auth: AuthContext,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    const target = await this.getChannelTarget(environment, input.version);
    const snapshot = await this.compatibilityCall(() =>
      this.channels.startUpload(auth, target.productId, environment, {
        version: target.productVersion,
      })
    );
    return serializeLegacyGoodsAction(snapshot, 'upload', environment);
  }

  async startPublish(
    auth: AuthContext,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    const target = await this.getChannelTarget(environment, input.version);
    const snapshot = await this.compatibilityCall(() =>
      this.channels.startPublish(auth, target.productId, environment, {
        version: target.productVersion,
      })
    );
    return serializeLegacyGoodsAction(snapshot, 'publish', environment);
  }

  async validate(
    auth: AuthContext,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    const target = await this.getChannelTarget(environment, input.version);
    const result = await this.compatibilityCall(() =>
      this.channels.validate(auth, target.productId, environment, {
        version: target.productVersion,
      })
    );
    const snapshot = await this.getSnapshot();
    const mapping = snapshot.mappings.find(
      (candidate) => candidate.environment === environment,
    );
    if (!mapping) {
      throw Errors.business(
        404,
        '虚拟商品映射不存在',
        'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND',
      );
    }
    return {
      virtual_product: serializeLegacyVirtualProduct(mapping),
      validation: {
        kind: 'wechat_goods' as const,
        validated_at: mapping.validated_at ?? result.mapping.updated_at,
        request_ids: {
          upload: null,
          publish: result.mapping.last_request_id ?? null,
        },
      },
    };
  }

  private async getProductId(): Promise<string> {
    return (await this.getSnapshot()).product.id;
  }

  private async getChannelTarget(
    environment: VirtualPaymentEnvironment,
    expectedMappingVersion: number,
  ) {
    const snapshot = await this.getSnapshot();
    const mapping = snapshot.mappings.find(
      (candidate) => candidate.environment === environment,
    );
    if (!mapping) {
      throw Errors.business(
        404,
        '虚拟商品映射不存在',
        'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND',
      );
    }
    if (mapping.version !== expectedMappingVersion) {
      throw Errors.business(
        409,
        '虚拟商品映射版本已变化，请刷新后重试',
        'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT',
      );
    }
    return {
      productId: snapshot.product.id,
      productVersion: snapshot.product.version,
    };
  }

  private async compatibilityCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapGenericChannelError(error);
    }
  }
}

function normalizeCatalogSnapshot(
  value: unknown,
): BrandingVirtualProductCatalogSnapshot {
  const product = requireRecord(value);
  const productId = requireText(product.id);
  const status = requireProductStatus(product.status);
  const grantRule = firstRecord(product.grant_rule);
  const termYears = grantRule?.duration_unit === 'year'
    ? requirePositiveInteger(grantRule.duration_value)
    : null;
  if (product.code !== BRANDING_ADDON_PRODUCT_CODE || termYears === null) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }

  return {
    product: {
      id: productId,
      code: BRANDING_ADDON_PRODUCT_CODE,
      entitlement_code: requireText(grantRule?.entitlement_code) as
        BrandingAddonProductRecord['entitlement_code'],
      name: requireText(product.name),
      amount_fen: requirePositiveInteger(product.amount_fen),
      term_years: termYears as BrandingAddonProductRecord['term_years'],
      purchase_notes: requireText(product.purchase_notes, true),
      refund_policy: BRANDING_ADDON_REFUND_POLICY,
      enabled: status !== 'archived',
      purchase_mode: purchaseMode(status),
      version: requirePositiveInteger(product.version),
      updated_by_employee_id: null,
      created_at: requireText(product.created_at),
      updated_at: requireText(product.updated_at),
    },
    mappings: toMappings(product.mappings, productId, product),
  };
}

function toMappings(
  value: unknown,
  productId: string,
  product: Record<string, unknown>,
): BrandingVirtualProductRecord[] {
  if (!Array.isArray(value)) return [];
  const image = firstRecord(product.image);
  const currentItemUrl = optionalText(image?.public_url);
  return value.map((item) => {
    const mapping = requireRecord(item);
    const channel = firstRecord(mapping.channel);
    const environment = requireEnvironment(channel?.environment);
    const remote = optionalRecord(mapping.remote_snapshot);
    return {
      id: requireText(mapping.id),
      addon_product_id: productId,
      provider: 'wechat_virtual',
      environment,
      app_id: requireText(channel?.app_id),
      virtual_merchant_id: requireText(channel?.virtual_merchant_id),
      offer_id: requireText(channel?.offer_id),
      provider_product_id: requireText(mapping.provider_product_id),
      item_url: currentItemUrl ?? optionalText(remote?.item_url),
      goods_quantity: 1,
      expected_amount_fen: requirePositiveInteger(product.amount_fen),
      encrypted_secret_ref: requireSecretKey(
        channel?.encrypted_secret_ref,
        environment,
      ),
      secret_revision: requirePositiveInteger(channel?.secret_revision),
      status: channel?.status === 'active' ? 'active' : 'disabled',
      validation_status: requireValidationStatus(mapping.validation_status),
      validated_at: optionalText(remote?.validated_at),
      version: requirePositiveInteger(channel?.version),
      created_by: null,
      updated_by: null,
      created_at: requireText(mapping.created_at),
      updated_at: requireText(mapping.updated_at),
    };
  });
}

function purchaseMode(status: 'draft' | 'active' | 'suspended' | 'archived') {
  if (status === 'active') return 'wechat_virtual' as const;
  if (status === 'draft') return 'direct_legacy' as const;
  return 'maintenance' as const;
}

function mapGenericChannelError(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  const code = LEGACY_CHANNEL_ERRORS[error.code];
  if (!code) return error;
  return Errors.business(error.statusCode, error.message, code, error.details);
}

const LEGACY_CHANNEL_ERRORS: Record<string, string> = {
  VIRTUAL_PRODUCT_MAPPING_NOT_FOUND: 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND',
  VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING:
    'BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING',
  VIRTUAL_PRODUCT_VERSION_CONFLICT:
    'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT',
  VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED:
    'BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED',
  VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID:
    'BRANDING_VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID',
  VIRTUAL_PRODUCT_WECHAT_OPERATION_FAILED:
    'BRANDING_VIRTUAL_PRODUCT_WECHAT_OPERATION_FAILED',
};

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return value as Record<string, unknown>;
}
function optionalRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function firstRecord(value: unknown): Record<string, unknown> | null {
  return optionalRecord(Array.isArray(value) ? value[0] : value);
}

function requireText(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requirePositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return Number(value);
}

function requireEnvironment(value: unknown): VirtualPaymentEnvironment {
  if (value !== 'sandbox' && value !== 'production') {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return value;
}

function requireProductStatus(
  value: unknown,
): 'draft' | 'active' | 'suspended' | 'archived' {
  if (!['draft', 'active', 'suspended', 'archived'].includes(String(value))) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return value as 'draft' | 'active' | 'suspended' | 'archived';
}

function requireValidationStatus(
  value: unknown,
): BrandingVirtualProductRecord['validation_status'] {
  if (!['pending', 'valid', 'invalid'].includes(String(value))) {
    throw Errors.dbError('年度品牌权益商品目录数据不完整');
  }
  return value as BrandingVirtualProductRecord['validation_status'];
}

function requireSecretKey(
  value: unknown,
  environment: VirtualPaymentEnvironment,
): BrandingVirtualPaymentSecretSettingKey {
  if (value !== SECRET_KEYS[environment]) {
    throw Errors.dbError('年度品牌权益渠道密钥引用无效');
  }
  return value as BrandingVirtualPaymentSecretSettingKey;
}

function environmentFromPatch(
  value: Record<string, unknown>,
): VirtualPaymentEnvironment | null {
  const environment = value.environment;
  return environment === 'sandbox' || environment === 'production'
    ? environment
    : null;
}

function serializeLegacyVirtualProduct(product: BrandingVirtualProductRecord) {
  return {
    environment: product.environment,
    app_id: product.app_id,
    virtual_merchant_id: product.virtual_merchant_id,
    offer_id: product.offer_id,
    provider_product_id: product.provider_product_id,
    item_url: product.item_url,
    expected_amount_fen: product.expected_amount_fen,
    encrypted_secret_ref: product.encrypted_secret_ref,
    secret_revision: product.secret_revision,
    status: product.status,
    validation_status: product.validation_status,
    validated_at: product.validated_at,
    version: product.version,
  };
}

type GenericChannelSnapshot = Awaited<ReturnType<
  ChannelServicePort['refresh']
>>;

function serializeLegacyGoodsStatus(snapshot: GenericChannelSnapshot) {
  const upload = legacyPhase(
    snapshot.mapping.upload_state,
    snapshot.mapping.last_request_id ?? null,
  );
  const publish = legacyPhase(
    snapshot.mapping.publish_state,
    snapshot.mapping.last_request_id ?? null,
  );
  const nextAction = upload.state === 'processing'
    ? 'wait_upload'
    : upload.state !== 'succeeded'
    ? 'upload'
    : publish.state === 'processing'
    ? 'wait_publish'
    : publish.state !== 'succeeded'
    ? 'publish'
    : 'validate';
  return {
    environment: snapshot.channel.environment,
    mapping_version: snapshot.channel.version,
    upload,
    publish,
    next_action: nextAction,
    poll_after_ms: upload.state === 'processing' || publish.state === 'processing'
      ? 2_000 as const
      : null,
  };
}

function serializeLegacyGoodsAction(
  snapshot: GenericChannelSnapshot,
  phase: 'upload' | 'publish',
  environment: VirtualPaymentEnvironment,
) {
  return {
    outcome: 'accepted' as const,
    phase,
    environment,
    mapping_version: snapshot.channel.version,
    request_id: snapshot.mapping.last_request_id ?? null,
  };
}

function legacyPhase(state: string, requestId: string | null) {
  const normalized = state === 'succeeded'
    ? 'succeeded'
    : state === 'processing'
    ? 'processing'
    : state === 'failed'
    ? 'failed'
    : state === 'not_started'
    ? 'not_started'
    : 'mismatch';
  const taskStatus = normalized === 'not_started'
    ? 0 as const
    : normalized === 'processing'
    ? 1 as const
    : normalized === 'failed'
    ? 2 as const
    : 3 as const;
  return {
    state: normalized,
    task_status: taskStatus,
    item_status: normalized === 'succeeded' ? 2 as const : null,
    request_id: requestId,
  };
}

const legacyChannelService = new PlatformVirtualProductChannelsService({
  accessPolicy: {
    assertPermission(auth) {
      return accessPolicyService.assertPermission(
        auth,
        LEGACY_MANAGE_PERMISSION,
      );
    },
  },
});

export const brandingVirtualProductCatalogCompatibilityService =
  new BrandingVirtualProductCatalogCompatibilityService();
