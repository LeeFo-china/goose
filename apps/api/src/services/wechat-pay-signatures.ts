import { createSign, randomUUID } from "node:crypto";

export type WechatPayAuthorizationInput = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlPath: string;
  body: string;
  merchantId: string;
  serialNo: string;
  privateKeyPem: string;
  nonce?: string;
  timestamp?: string;
};

export type WechatPayRequestSignMessageInput = Pick<
  WechatPayAuthorizationInput,
  "method" | "urlPath" | "body"
> & {
  nonce: string;
  timestamp: string;
};

export type WechatPayMiniProgramPaymentRequestInput = {
  appId: string;
  prepayId: string;
  privateKeyPem: string;
  nonce?: string;
  timestamp?: string;
};

export type WechatPayMiniProgramPaymentRequest = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
};

export type WechatPayMiniProgramSignMessageInput = {
  appId: string;
  timestamp: string;
  nonce: string;
  packageValue: string;
};

export function buildWechatPayAuthorization(
  input: WechatPayAuthorizationInput,
) {
  const nonce = input.nonce ?? createNonce();
  const timestamp = input.timestamp ?? createTimestamp();
  const message = buildWechatPayRequestSignMessage({
    method: input.method,
    urlPath: input.urlPath,
    body: input.body,
    nonce,
    timestamp,
  });
  const signature = signWechatPayMessage(message, input.privateKeyPem);

  const credentials = [
    `mchid="${input.merchantId}"`,
    `nonce_str="${nonce}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${input.serialNo}"`,
  ].join(",");

  return `WECHATPAY2-SHA256-RSA2048 ${credentials}`;
}

export function buildWechatPayRequestSignMessage(
  input: WechatPayRequestSignMessageInput,
) {
  return [
    input.method.toUpperCase(),
    input.urlPath,
    input.timestamp,
    input.nonce,
    input.body,
    "",
  ].join("\n");
}

export function buildWechatPayMiniProgramPaymentRequest(
  input: WechatPayMiniProgramPaymentRequestInput,
): WechatPayMiniProgramPaymentRequest {
  const nonce = input.nonce ?? createNonce();
  const timestamp = input.timestamp ?? createTimestamp();
  const packageValue = `prepay_id=${input.prepayId}`;
  const message = buildWechatPayMiniProgramSignMessage({
    appId: input.appId,
    timestamp,
    nonce,
    packageValue,
  });

  return {
    timeStamp: timestamp,
    nonceStr: nonce,
    package: packageValue,
    signType: "RSA",
    paySign: signWechatPayMessage(message, input.privateKeyPem),
  };
}

export function buildWechatPayMiniProgramSignMessage(
  input: WechatPayMiniProgramSignMessageInput,
) {
  return [
    input.appId,
    input.timestamp,
    input.nonce,
    input.packageValue,
    "",
  ].join("\n");
}

function signWechatPayMessage(message: string, privateKeyPem: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

function createNonce() {
  return randomUUID().replaceAll("-", "");
}

function createTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}
