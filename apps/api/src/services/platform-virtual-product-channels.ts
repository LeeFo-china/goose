import type { VirtualPaymentEnvironment } from '@gooes/domain';

import { AppError } from '../errors/app-error';
import { Errors } from '../errors/error-factory';
import {
  platformVirtualGoodsOperationsRepository,
  type PlatformVirtualGoodsOperationRecord,
  type PlatformVirtualGoodsPhase,
  type PlatformVirtualProductChannelSnapshot,
} from '../repositories/platform-virtual-goods-operations';
import type { PlatformVirtualProductVersionCommandInput } from '../schema/platform-virtual-products';
import { accessPolicyService } from './access-policy';
import type { AuthContext } from './authorization';
import {
  evaluatePublishEvidence,
  evaluateUploadEvidence,
  hashVirtualGoodsSnapshot,
  parseWechatVirtualPaymentSecretBundle,
} from './platform-virtual-product-channel-evidence';
import { platformAuditLogService } from './platform-audit-logs';
import { systemSettingsService } from './system-settings';
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from './wechat-miniprogram-access-token';
import { WechatVirtualPaymentGateway } from './wechat-virtual-payment-gateway';
import type {
  QueryVirtualGoodsTaskInput,
  WechatVirtualPaymentGatewayPort,
} from './wechat-virtual-payment-gateway-contracts';
import { isValidVirtualGoodsUploadItem } from './wechat-virtual-payment-goods-input';
import { wechatMiniSessionCredentialService } from './wechat-mini-session-credentials';

const READ = 'platform.virtual_product.read';
const PUBLISH = 'platform.virtual_product.publish';

type OperationsPort = Pick<
  typeof platformVirtualGoodsOperationsRepository,
  'getSnapshot' | 'findRunningByChannel' | 'begin' | 'finish'
>;
type SettingsPort = Pick<typeof systemSettingsService, 'getPlatformSecretString'>;
type AccessPolicyPort = Pick<typeof accessPolicyService, 'assertPermission'>;
type AuditPort = Pick<typeof platformAuditLogService, 'recordBestEffort'>;
type GatewayPort = Pick<
  WechatVirtualPaymentGatewayPort,
  'queryUploadGoods' | 'queryPublishGoods' | 'startUploadGoods' | 'startPublishGoods'
>;

export type PlatformVirtualProductChannelsServiceDependencies = {
  operations?: OperationsPort;
  settingsService?: SettingsPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  gateway?: GatewayPort;
};

type Actor = {
  employeeId: string;
  authUserId: string;
};

type PreparedChannel = {
  actor: Actor;
  snapshot: PlatformVirtualProductChannelSnapshot;
  signedInput: QueryVirtualGoodsTaskInput;
  item: {
    id: string;
    name: string;
    price: number;
    remark: string;
    itemUrl: string;
  };
  snapshotHash: string;
};

export class PlatformVirtualProductChannelsService {
  private readonly operations: OperationsPort;
  private readonly settings: SettingsPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;
  private readonly gateway: GatewayPort;

  constructor(
    dependencies: PlatformVirtualProductChannelsServiceDependencies = {},
  ) {
    this.operations = dependencies.operations ??
      platformVirtualGoodsOperationsRepository;
    this.settings = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
  }

  async refresh(
    auth: AuthContext,
    productId: string,
    environment: VirtualPaymentEnvironment,
  ) {
    this.assertPlatform(auth, READ);
    const snapshot = await this.requireSnapshot(productId, environment);
    const running = await this.operations.findRunningByChannel(
      snapshot.channel.id,
    );

    if (!running) return snapshot;
    if (running.product_id !== productId || running.mapping_id !== snapshot.mapping.id) {
      throw Errors.business(
        409,
        '微信虚拟商品仍在处理中，请稍后重新校验',
        'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING',
        { operationId: running.id, channelId: running.channel_id },
      );
    }

    const prepared = await this.prepare(auth, productId, environment);
    const evidence = running.phase === 'upload'
      ? evaluateUploadEvidence(
        await this.gateway.queryUploadGoods(prepared.signedInput),
        prepared.item,
      )
      : evaluatePublishEvidence(
        await this.gateway.queryPublishGoods(prepared.signedInput),
        prepared.item,
      );

    await this.operations.finish({
      operationId: running.id,
      state: evidence.state,
      requestId: evidence.requestId,
      normalizedResult: evidence.normalizedResult,
      failureCode: evidence.failureCode,
      failureSummary: evidence.failureSummary,
      syncedProductVersion: evidence.state === 'succeeded'
        ? running.product_version
        : null,
    });
    return await this.requireSnapshot(productId, environment);
  }

  async startUpload(
    auth: AuthContext,
    productId: string,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    const prepared = await this.prepare(auth, productId, environment, {
      expectedVersion: input.version,
      permission: PUBLISH,
    });
    const operation = await this.operations.begin({
      mappingId: prepared.snapshot.mapping.id,
      productVersion: prepared.snapshot.version,
      phase: 'upload',
      requestSnapshotHash: prepared.snapshotHash,
    });

    try {
      const started = await this.gateway.startUploadGoods({
        ...prepared.signedInput,
        item: prepared.item,
      });
      await this.operations.finish({
        operationId: operation.id,
        state: 'processing',
        requestId: started.requestId,
        normalizedResult: {
          phase: 'upload',
          accepted: true,
          provider_product_id: prepared.item.id,
        },
        failureCode: null,
        failureSummary: null,
        syncedProductVersion: null,
      });
      await this.auditOperation(prepared, 'upload', started.requestId);
      return await this.requireSnapshot(productId, environment);
    } catch (error) {
      await this.finishFailure(operation.id, error);
      throw mapWechatGoodsError(error);
    }
  }

  async startPublish(
    auth: AuthContext,
    productId: string,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    const prepared = await this.prepare(auth, productId, environment, {
      expectedVersion: input.version,
      permission: PUBLISH,
    });
    if (prepared.snapshot.mapping.upload_state !== 'succeeded') {
      throw Errors.business(
        409,
        '当前微信商品尚未完成上传，不能发布',
        'VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED',
      );
    }
    const operation = await this.operations.begin({
      mappingId: prepared.snapshot.mapping.id,
      productVersion: prepared.snapshot.version,
      phase: 'publish',
      requestSnapshotHash: prepared.snapshotHash,
    });

    try {
      const started = await this.gateway.startPublishGoods({
        ...prepared.signedInput,
        providerProductId: prepared.item.id,
      });
      await this.operations.finish({
        operationId: operation.id,
        state: 'processing',
        requestId: started.requestId,
        normalizedResult: {
          phase: 'publish',
          accepted: true,
          provider_product_id: prepared.item.id,
        },
        failureCode: null,
        failureSummary: null,
        syncedProductVersion: null,
      });
      await this.auditOperation(prepared, 'publish', started.requestId);
      return await this.requireSnapshot(productId, environment);
    } catch (error) {
      await this.finishFailure(operation.id, error);
      throw mapWechatGoodsError(error);
    }
  }

  async validate(
    auth: AuthContext,
    productId: string,
    environment: VirtualPaymentEnvironment,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    this.assertPlatform(auth, PUBLISH);
    const snapshot = await this.requireSnapshot(productId, environment);
    if (snapshot.version !== input.version) throw versionConflict();
    if (isSynchronized(snapshot)) return snapshot;
    const refreshed = await this.refresh(auth, productId, environment);
    if (isSynchronized(refreshed)) return refreshed;
    if (
      refreshed.mapping.upload_state === 'processing' ||
      refreshed.mapping.publish_state === 'processing'
    ) {
      throw Errors.business(
        409,
        '微信虚拟商品仍在处理中，请稍后重新校验',
        'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING',
      );
    }
    throw Errors.business(
      409,
      '微信虚拟商品尚未完成上传、发布和校验',
      'VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID',
    );
  }

  private async prepare(
    auth: AuthContext,
    productId: string,
    environment: VirtualPaymentEnvironment,
    options: { expectedVersion?: number; permission?: string } = {},
  ): Promise<PreparedChannel> {
    const actor = this.assertPlatform(auth, options.permission ?? READ);
    const snapshot = await this.requireSnapshot(productId, environment);
    if (
      options.expectedVersion !== undefined &&
      snapshot.version !== options.expectedVersion
    ) {
      throw versionConflict();
    }
    if (snapshot.channel.status !== 'active') {
      throw Errors.business(
        409,
        '微信虚拟支付渠道未启用',
        'VIRTUAL_PRODUCT_CHANNEL_DISABLED',
      );
    }

    const rawSecret = await this.settings.getPlatformSecretString(
      snapshot.channel.encrypted_secret_ref,
    );
    const secret = parseWechatVirtualPaymentSecretBundle(rawSecret);
    if (!secret || secret.revision !== snapshot.channel.secret_revision) {
      throw Errors.business(
        409,
        '虚拟支付密钥未配置或版本不匹配',
        'VIRTUAL_PRODUCT_SECRET_INVALID',
      );
    }

    const item = {
      id: snapshot.mapping.provider_product_id,
      name: snapshot.name,
      price: snapshot.amount_fen,
      remark: snapshot.purchase_notes,
      itemUrl: snapshot.image_url ?? '',
    };
    if (!isValidVirtualGoodsUploadItem(item)) {
      throw Errors.business(
        409,
        '微信虚拟商品本地配置不符合上传要求',
        'VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID',
      );
    }

    const accessToken = await this.accessTokenProvider.getAccessToken();
    const signedInput = {
      accessToken,
      environment,
      signingSecret: { environment, appKey: secret.appKey },
    };

    return {
      actor,
      snapshot,
      signedInput,
      item,
      snapshotHash: hashVirtualGoodsSnapshot({
        productId,
        productVersion: snapshot.version,
        channelId: snapshot.channel.id,
        mappingId: snapshot.mapping.id,
        item,
      }),
    };
  }

  private async requireSnapshot(
    productId: string,
    environment: VirtualPaymentEnvironment,
  ): Promise<PlatformVirtualProductChannelSnapshot> {
    const snapshot = await this.operations.getSnapshot(productId, environment);
    if (!snapshot) {
      throw Errors.business(
        404,
        '虚拟商品渠道映射不存在',
        'VIRTUAL_PRODUCT_MAPPING_NOT_FOUND',
      );
    }
    return snapshot;
  }

  private assertPlatform(auth: AuthContext, permission: string): Actor {
    const isPlatformIdentity = auth.isPlatformStaff || auth.isPlatformAdmin;
    if (
      auth.tenantId !== null ||
      !isPlatformIdentity ||
      !auth.employeeId ||
      !auth.authUserId
    ) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(auth, permission);
    return {
      employeeId: auth.employeeId,
      authUserId: auth.authUserId,
    };
  }

  private async finishFailure(
    operationId: string,
    error: unknown,
  ): Promise<void> {
    await this.operations.finish({
      operationId,
      state: 'failed',
      requestId: requestIdFromError(error),
      normalizedResult: null,
      failureCode: codeFromError(error),
      failureSummary: messageFromError(error),
      syncedProductVersion: null,
    });
  }

  private auditOperation(
    prepared: PreparedChannel,
    phase: PlatformVirtualGoodsPhase,
    requestId: string | null,
  ) {
    return this.audit.recordBestEffort({
      action: `platform_virtual_product.${phase}`,
      actorEmployeeId: prepared.actor.employeeId,
      actorUserId: prepared.actor.authUserId,
      resourceType: 'platform_virtual_product',
      resourceId: prepared.snapshot.id,
      resourceLabel: prepared.snapshot.name,
      status: 'success',
      summary: phase === 'upload'
        ? '启动平台虚拟商品微信上传'
        : '启动平台虚拟商品微信发布',
      metadata: {
        environment: prepared.snapshot.channel.environment,
        mapping_id: prepared.snapshot.mapping.id,
        provider_product_id: prepared.snapshot.mapping.provider_product_id,
        product_version: prepared.snapshot.version,
        request_id: requestId,
      },
    });
  }
}

function versionConflict() {
  return Errors.business(
    409,
    '虚拟商品版本已变化，请刷新后重试',
    'VIRTUAL_PRODUCT_VERSION_CONFLICT',
  );
}

function mapWechatGoodsError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  return Errors.business(
    502,
    '微信虚拟商品操作失败',
    'VIRTUAL_PRODUCT_WECHAT_OPERATION_FAILED',
  );
}

function isSynchronized(snapshot: PlatformVirtualProductChannelSnapshot) {
  return snapshot.mapping.upload_state === 'succeeded' &&
    snapshot.mapping.publish_state === 'succeeded' &&
    snapshot.mapping.validation_status === 'valid' &&
    snapshot.mapping.synced_product_version === snapshot.version;
}

function requestIdFromError(error: unknown): string | null {
  if (!(error instanceof AppError) || !isRecord(error.details)) return null;
  const requestId = error.details.requestId;
  return typeof requestId === 'string' ? requestId : null;
}

function codeFromError(error: unknown): string {
  return error instanceof AppError
    ? error.code
    : 'VIRTUAL_PRODUCT_WECHAT_OPERATION_FAILED';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : '微信虚拟商品操作失败';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export const platformVirtualProductChannelService =
  new PlatformVirtualProductChannelsService();
