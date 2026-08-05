import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from
  "@/repositories/branding-addon-products";
import {
  brandingVirtualProductRepository,
  type BrandingVirtualProductRecord,
} from "@/repositories/branding-virtual-products";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  isApplicationErrorLike,
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";
import { wechatMiniSessionCredentialService } from
  "@/services/wechat-mini-session-credentials";
import { WechatVirtualPaymentGateway } from
  "@/services/wechat-virtual-payment-gateway";
import type {
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsUploadResult,
  WechatVirtualPaymentGatewayPort,
} from "@/services/wechat-virtual-payment-gateway-contracts";
import { isValidVirtualGoodsUploadItem } from
  "@/services/wechat-virtual-payment-goods-input";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

const MANAGE_PERMISSION = "platform.payment.config.manage";
const POLL_AFTER_MS = 2_000 as const;
const WECHAT_BATCH_RUNNING_CODE = 268490012;
const SECRET_KEYS = [
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
] as const;

type RepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "getManagementSnapshot"
>;
type SettingsPort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretStrings"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type GatewayPort = Pick<
  WechatVirtualPaymentGatewayPort,
  | "queryUploadGoods"
  | "queryPublishGoods"
  | "startUploadGoods"
  | "startPublishGoods"
>;

export type BrandingVirtualGoodsPhaseState =
  | "not_started"
  | "processing"
  | "succeeded"
  | "failed"
  | "mismatch";

type PreparedGoods = {
  actor: { employeeId: string; authUserId: string };
  product: BrandingAddonProductRecord;
  mapping: BrandingVirtualProductRecord;
  environment: BrandingVirtualPaymentEnvironment;
  appKey: string;
  item: {
    id: string;
    name: string;
    price: number;
    remark: string;
    itemUrl: string;
  };
};

export type BrandingVirtualProductGoodsLifecycleDependencies = {
  virtualProductRepository?: RepositoryPort;
  settingsService?: SettingsPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  gateway?: GatewayPort;
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
};

export class BrandingVirtualProductGoodsLifecycleService {
  private readonly repository: RepositoryPort;
  private readonly settings: SettingsPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly gateway: GatewayPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;

  constructor(
    dependencies: BrandingVirtualProductGoodsLifecycleDependencies = {},
  ) {
    this.repository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.settings = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
  }

  async getStatus(
    authContext: AuthContext,
    environment: BrandingVirtualPaymentEnvironment,
  ) {
    const prepared = await this.prepare(authContext, environment);
    const signedInput = await this.signedInput(prepared);
    const [upload, publish] = await Promise.all([
      this.gateway.queryUploadGoods(signedInput),
      this.gateway.queryPublishGoods(signedInput),
    ]);
    return buildLifecycleSnapshot(prepared, upload, publish);
  }

  async startUpload(
    authContext: AuthContext,
    input: { environment: BrandingVirtualPaymentEnvironment; version: number },
  ) {
    const prepared = await this.prepare(
      authContext,
      input.environment,
      input.version,
    );
    const signedInput = await this.signedInput(prepared);
    const current = await this.gateway.queryUploadGoods(signedInput);
    const currentState = uploadPhase(current, prepared.item).state;
    if (currentState === "processing" || currentState === "succeeded") {
      return await this.finishAction(
        prepared,
        "upload",
        currentState === "processing"
          ? "already_processing"
          : "already_succeeded",
        current.requestId,
      );
    }

    try {
      const started = await this.gateway.startUploadGoods({
        ...signedInput,
        item: prepared.item,
      });
      return await this.finishAction(
        prepared,
        "upload",
        "accepted",
        started.requestId,
      );
    } catch (error) {
      if (!isWechatBatchRunning(error)) throw error;
      const recovered = await this.gateway.queryUploadGoods(signedInput);
      if (uploadPhase(recovered, prepared.item).state !== "processing") {
        throw error;
      }
      return await this.finishAction(
        prepared,
        "upload",
        "already_processing",
        recovered.requestId,
      );
    }
  }

  async startPublish(
    authContext: AuthContext,
    input: { environment: BrandingVirtualPaymentEnvironment; version: number },
  ) {
    const prepared = await this.prepare(
      authContext,
      input.environment,
      input.version,
    );
    const signedInput = await this.signedInput(prepared);
    const upload = await this.gateway.queryUploadGoods(signedInput);
    if (uploadPhase(upload, prepared.item).state !== "succeeded") {
      throw Errors.business(
        409,
        "当前微信商品尚未完成上传，不能发布",
        "BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED",
        { requestId: upload.requestId },
      );
    }
    const current = await this.gateway.queryPublishGoods(signedInput);
    const currentState = publishPhase(current, prepared.item.id).state;
    if (currentState === "processing" || currentState === "succeeded") {
      return await this.finishAction(
        prepared,
        "publish",
        currentState === "processing"
          ? "already_processing"
          : "already_succeeded",
        current.requestId,
      );
    }

    try {
      const started = await this.gateway.startPublishGoods({
        ...signedInput,
        providerProductId: prepared.item.id,
      });
      return await this.finishAction(
        prepared,
        "publish",
        "accepted",
        started.requestId,
      );
    } catch (error) {
      if (!isWechatBatchRunning(error)) throw error;
      const recovered = await this.gateway.queryPublishGoods(signedInput);
      if (publishPhase(recovered, prepared.item.id).state !== "processing") {
        throw error;
      }
      return await this.finishAction(
        prepared,
        "publish",
        "already_processing",
        recovered.requestId,
      );
    }
  }

  private async prepare(
    authContext: AuthContext,
    environment: BrandingVirtualPaymentEnvironment,
    expectedVersion?: number,
  ): Promise<PreparedGoods> {
    const actor = this.requireOperator(authContext);
    let snapshot: Awaited<ReturnType<RepositoryPort["getManagementSnapshot"]>>;
    let secretValues: Record<string, string>;
    try {
      [snapshot, secretValues] = await Promise.all([
        this.repository.getManagementSnapshot(),
        this.settings.getPlatformSecretStrings(SECRET_KEYS),
      ]);
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("读取微信虚拟商品配置失败");
    }
    const mapping = snapshot.mappings.find(
      (candidate) => candidate.environment === environment,
    );
    if (!mapping) {
      throw Errors.business(
        404,
        "虚拟商品映射不存在",
        "BRANDING_VIRTUAL_PRODUCT_NOT_FOUND",
      );
    }
    if (expectedVersion !== undefined && mapping.version !== expectedVersion) {
      throw Errors.business(
        409,
        "虚拟商品映射版本已变化，请刷新后重试",
        "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
      );
    }
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
    const bundle = parseWechatVirtualPaymentSecretBundle(secretValues[key] ?? "");
    if (
      mapping.encrypted_secret_ref !== key ||
      !bundle || bundle.revision !== mapping.secret_revision
    ) {
      throw Errors.business(
        409,
        "虚拟支付密钥未配置或版本不匹配",
        "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
      );
    }
    const item = {
      id: mapping.provider_product_id,
      name: snapshot.product.name,
      price: mapping.expected_amount_fen,
      remark: snapshot.product.purchase_notes,
      itemUrl: mapping.item_url ?? "",
    };
    if (
      mapping.expected_amount_fen !== snapshot.product.amount_fen ||
      !isValidVirtualGoodsUploadItem(item)
    ) {
      throw Errors.business(
        409,
        "微信虚拟商品本地配置不符合上传要求",
        "BRANDING_VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID",
      );
    }
    return { actor, product: snapshot.product, mapping, environment, appKey: bundle.appKey, item };
  }

  private requireOperator(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true ||
      authContext.isPlatformAdmin === true;
    if (
      !isPlatformIdentity || authContext.tenantId !== null ||
      !authContext.employeeId || !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async signedInput(prepared: PreparedGoods) {
    const accessToken = await this.accessTokenProvider.getAccessToken();
    return {
      accessToken,
      environment: prepared.environment,
      signingSecret: {
        environment: prepared.environment,
        appKey: prepared.appKey,
      },
    };
  }

  private async finishAction(
    prepared: PreparedGoods,
    phase: "upload" | "publish",
    outcome: "accepted" | "already_processing" | "already_succeeded",
    requestId: string | null,
  ) {
    await this.audit.recordBestEffort({
      action: `branding_virtual_product.${phase}`,
      actorEmployeeId: prepared.actor.employeeId,
      actorUserId: prepared.actor.authUserId,
      resourceType: "branding_virtual_product",
      resourceId: prepared.mapping.id,
      resourceLabel: `${prepared.product.name}-${prepared.environment}`,
      status: "success",
      summary: phase === "upload"
        ? "启动品牌权益虚拟商品微信上传"
        : "启动品牌权益虚拟商品微信发布",
      metadata: {
        environment: prepared.environment,
        mapping_version: prepared.mapping.version,
        provider_product_id: prepared.mapping.provider_product_id,
        outcome,
        request_id: requestId,
      },
    });
    return {
      outcome,
      phase,
      environment: prepared.environment,
      mapping_version: prepared.mapping.version,
      request_id: requestId,
    };
  }
}

function buildLifecycleSnapshot(
  prepared: PreparedGoods,
  uploadResult: QueryVirtualGoodsUploadResult,
  publishResult: QueryVirtualGoodsPublishResult,
) {
  const upload = uploadPhase(uploadResult, prepared.item);
  const publish = publishPhase(publishResult, prepared.item.id);
  const nextAction = upload.state === "processing"
    ? "wait_upload"
    : upload.state !== "succeeded"
    ? "upload"
    : publish.state === "processing"
    ? "wait_publish"
    : publish.state !== "succeeded"
    ? "publish"
    : "validate";
  return {
    environment: prepared.environment,
    mapping_version: prepared.mapping.version,
    upload,
    publish,
    next_action: nextAction,
    poll_after_ms: upload.state === "processing" || publish.state === "processing"
      ? POLL_AFTER_MS
      : null,
  };
}

function uploadPhase(
  result: QueryVirtualGoodsUploadResult,
  expected: PreparedGoods["item"],
) {
  const item = result.items[0];
  const exact = result.status === 3 && result.items.length === 1 &&
    item?.id === expected.id && item.name === expected.name &&
    item.price === expected.price && item.remark === expected.remark &&
    item.itemUrl === expected.itemUrl && item.uploadStatus === 2;
  return phaseSummary(
    result.status === 0 ? "not_started" : result.status === 1
      ? "processing" : exact ? "succeeded"
      : result.status === 2 ? "failed" : "mismatch",
    result.status,
    item?.uploadStatus ?? null,
    result.requestId,
  );
}

function publishPhase(
  result: QueryVirtualGoodsPublishResult,
  expectedId: string,
) {
  const item = result.items[0];
  const exact = result.status === 3 && result.items.length === 1 &&
    item?.id === expectedId && item.publishStatus === 2;
  return phaseSummary(
    result.status === 0 ? "not_started" : result.status === 1
      ? "processing" : exact ? "succeeded"
      : result.status === 2 ? "failed" : "mismatch",
    result.status,
    item?.publishStatus ?? null,
    result.requestId,
  );
}

function phaseSummary(
  state: BrandingVirtualGoodsPhaseState,
  taskStatus: 0 | 1 | 2 | 3,
  itemStatus: 0 | 1 | 2 | 3 | null,
  requestId: string | null,
) {
  return {
    state,
    task_status: taskStatus,
    item_status: itemStatus,
    request_id: requestId,
  };
}

function isWechatBatchRunning(error: unknown): boolean {
  if (!(error instanceof AppError) || ![
    "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
    "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
  ].includes(error.code) || !error.details ||
    typeof error.details !== "object" || Array.isArray(error.details)) {
    return false;
  }
  return Number((error.details as Record<string, unknown>).wechatErrcode) ===
    WECHAT_BATCH_RUNNING_CODE;
}

export const brandingVirtualProductGoodsLifecycleService =
  new BrandingVirtualProductGoodsLifecycleService();
