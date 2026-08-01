import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
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
import { normalizeWechatVirtualPaymentRequestId } from
  "@/services/wechat-virtual-payment-response-reader";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

type GatewayPort = Pick<
  WechatVirtualPaymentGatewayPort,
  "queryUploadGoods" | "queryPublishGoods"
>;

export type WechatGoodsValidationResult = {
  uploadRequestId: string | null;
  publishRequestId: string | null;
};

export type WechatGoodsValidationFailure = {
  confirmedInvalid: boolean;
  error: AppError;
};

export interface BrandingVirtualProductWechatValidatorPort {
  validate(input: {
    environment: BrandingVirtualPaymentEnvironment;
    providerProductId: string;
    expectedAmountFen: number;
    appKey: string;
  }): Promise<WechatGoodsValidationResult>;
}

export class BrandingVirtualProductWechatValidator
  implements BrandingVirtualProductWechatValidatorPort {
  private readonly gateway: GatewayPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;

  constructor(dependencies: {
    gateway?: GatewayPort;
    accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  } = {}) {
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
  }

  async validate(input: {
    environment: BrandingVirtualPaymentEnvironment;
    providerProductId: string;
    expectedAmountFen: number;
    appKey: string;
  }): Promise<WechatGoodsValidationResult> {
    const accessToken = await this.accessTokenProvider.getAccessToken();
    const signedInput = {
      accessToken,
      environment: input.environment,
      signingSecret: { environment: input.environment, appKey: input.appKey },
    };
    const upload = await this.gateway.queryUploadGoods(signedInput);
    assertUploadTaskMatches(upload, input.providerProductId, input.expectedAmountFen);
    const publish = await this.gateway.queryPublishGoods(signedInput);
    assertPublishTaskMatches(publish, input.providerProductId);
    return {
      uploadRequestId: upload.requestId,
      publishRequestId: publish.requestId,
    };
  }
}

export function classifyWechatGoodsFailure(
  error: unknown,
): WechatGoodsValidationFailure {
  if (error instanceof AppError) {
    const details = safeWechatFailureDetails(error.details);
    if (
      error.code === "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED" ||
      (error.code === "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR" &&
        details.wechatErrcode !== null)
    ) {
      return {
        confirmedInvalid: true,
        error: Errors.business(
          409,
          "微信拒绝了最近虚拟商品任务查询，请核对支付配置",
          "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_REJECTED",
          details,
        ),
      };
    }
    if (
      error.code === "BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_MISMATCH" ||
      error.code === "BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_MISMATCH"
    ) {
      return { confirmedInvalid: true, error };
    }
    if (error.code === "BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING") {
      return { confirmedInvalid: false, error };
    }
    return {
      confirmedInvalid: false,
      error: Errors.business(
        error.statusCode,
        error.message,
        error.code,
        details,
      ),
    };
  }
  return {
    confirmedInvalid: false,
    error: Errors.business(
      502,
      "微信虚拟商品状态暂时无法确认，请稍后重试",
      "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_UNCONFIRMED",
      { requestId: null, wechatErrcode: null },
    ),
  };
}

function assertUploadTaskMatches(
  result: QueryVirtualGoodsUploadResult,
  providerProductId: string,
  expectedAmountFen: number,
): void {
  if (result.status === 1) throwGoodsTaskPending(result.requestId, "上传");
  // The official query returns only the latest batch task, not a complete
  // goods catalog. This application owns exactly one virtual goods mapping,
  // so that latest task must contain exactly that one successfully uploaded
  // item before the mapping can be trusted.
  const item = result.items[0];
  if (
    result.status !== 3 || result.items.length !== 1 ||
    item?.id !== providerProductId || item.uploadStatus !== 2 ||
    item.price !== expectedAmountFen
  ) {
    throw Errors.business(
      409,
      "微信最近一次批量上传任务未确认当前单商品及价格",
      "BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_MISMATCH",
      { requestId: result.requestId },
    );
  }
}

function assertPublishTaskMatches(
  result: QueryVirtualGoodsPublishResult,
  providerProductId: string,
): void {
  if (result.status === 1) throwGoodsTaskPending(result.requestId, "发布");
  // See the upload assertion above: this is a latest-task check under the
  // fixed single-goods product boundary, not a full remote catalog lookup.
  const item = result.items[0];
  if (
    result.status !== 3 || result.items.length !== 1 ||
    item?.id !== providerProductId || item.publishStatus !== 2
  ) {
    throw Errors.business(
      409,
      "微信最近一次批量发布任务未确认当前单商品已发布",
      "BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_MISMATCH",
      { requestId: result.requestId },
    );
  }
}

function throwGoodsTaskPending(
  requestId: string | null,
  phase: "上传" | "发布",
): never {
  throw Errors.business(
    409,
    `微信最近一次批量${phase}任务仍在处理中，请稍后重试`,
    "BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING",
    { requestId },
  );
}

function safeWechatFailureDetails(value: unknown): {
  requestId: string | null;
  wechatErrcode: number | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { requestId: null, wechatErrcode: null };
  }
  const record = value as Record<string, unknown>;
  return {
    requestId: normalizeWechatVirtualPaymentRequestId(
      typeof record.requestId === "string" ? record.requestId : null,
    ),
    wechatErrcode: Number.isSafeInteger(record.wechatErrcode)
      ? Number(record.wechatErrcode)
      : null,
  };
}
