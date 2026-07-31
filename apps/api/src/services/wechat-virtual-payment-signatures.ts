import { createHmac } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import { BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN } from "@gooes/domain";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

const PROVIDER_IDENTIFIER_MAX_LENGTH = 128;
const OUT_TRADE_NO_PATTERN = /^(?!_)[A-Za-z0-9_|*@-]{8,32}$/;

export type WechatVirtualPaymentSigningSecret = {
  environment: BrandingVirtualPaymentEnvironment;
  appKey: string;
};

export type BuildVirtualPaymentRequestInput = {
  environment: BrandingVirtualPaymentEnvironment;
  signingSecret: WechatVirtualPaymentSigningSecret;
  sessionKey: string;
  offerId: string;
  productId: string;
  goodsPrice: number;
  outTradeNo: string;
  attach: string;
};

export type WechatVirtualPaymentRequest = {
  signData: string;
  paySig: string;
  signature: string;
  mode: "short_series_goods";
};

export function buildVirtualPaymentRequest(
  input: BuildVirtualPaymentRequestInput,
): WechatVirtualPaymentRequest {
  assertSigningSecret(input.environment, input.signingSecret);
  if (
    !isBoundedIdentifier(input.offerId) ||
    !isBoundedIdentifier(input.productId) ||
    !isNonBlankString(input.attach) ||
    !isNonBlankString(input.sessionKey) ||
    !Number.isSafeInteger(input.goodsPrice) ||
    input.goodsPrice < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN ||
    !OUT_TRADE_NO_PATTERN.test(input.outTradeNo)
  ) {
    throwInvalidRequest();
  }

  const signData = JSON.stringify({
    offerId: input.offerId,
    buyQuantity: 1,
    env: virtualPaymentEnv(input.environment),
    currencyType: "CNY",
    productId: input.productId,
    goodsPrice: input.goodsPrice,
    outTradeNo: input.outTradeNo,
    attach: input.attach,
  });

  return {
    signData,
    paySig: calculateVirtualPaymentPaySig(
      "requestVirtualPayment",
      signData,
      input.signingSecret.appKey,
    ),
    signature: calculateVirtualPaymentUserSignature(
      signData,
      input.sessionKey,
    ),
    mode: "short_series_goods",
  };
}

export function calculateVirtualPaymentPaySig(
  uri: string,
  signData: string,
  appKey: string,
): string {
  return createHmac("sha256", appKey)
    .update(`${uri}&${signData}`, "utf8")
    .digest("hex");
}

export function calculateVirtualPaymentUserSignature(
  signData: string,
  sessionKey: string,
): string {
  return createHmac("sha256", sessionKey)
    .update(signData, "utf8")
    .digest("hex");
}

export function assertSigningSecret(
  environment: BrandingVirtualPaymentEnvironment,
  secret: WechatVirtualPaymentSigningSecret | null | undefined,
): void {
  if (!secret || !isNonBlankString(secret.appKey)) throwInvalidRequest();
  if (secret.environment !== environment) {
    throw Errors.business(
      409,
      "微信虚拟支付密钥环境不匹配",
      "WECHAT_VIRTUAL_PAYMENT_APP_KEY_ENVIRONMENT_MISMATCH",
    );
  }
}

export function virtualPaymentEnv(
  environment: BrandingVirtualPaymentEnvironment,
): 0 | 1 {
  if (environment === "production") return 0;
  if (environment === "sandbox") return 1;
  throwInvalidRequest();
}

function isBoundedIdentifier(value: string): boolean {
  return isNonBlankString(value) &&
    value === value.trim() &&
    value.length <= PROVIDER_IDENTIFIER_MAX_LENGTH;
}

function isNonBlankString(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function throwInvalidRequest(): never {
  throw Errors.business(
    400,
    "微信虚拟支付请求参数不正确",
    "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
  );
}
