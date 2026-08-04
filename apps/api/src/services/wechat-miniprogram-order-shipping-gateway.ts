import { Errors } from "@/errors/error-factory";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";

const ORDER_SHIPPING_ENDPOINT =
  "https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info";
const REQUEST_TIMEOUT_MS = 8_000;

type FetchPort = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type Dependencies = {
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  fetchImpl?: FetchPort;
  requestTimeoutMs?: number;
};

export type WechatOrderShippingPayload = {
  order_key: {
    order_number_type: 1 | 2;
    transaction_id?: string;
    mchid?: string;
    out_trade_no?: string;
  };
  logistics_type: 1 | 2 | 3 | 4;
  delivery_mode: 1 | 2;
  is_all_delivered?: boolean;
  shipping_list: Array<{
    item_desc: string;
    tracking_no?: string;
    express_company?: string;
  }>;
  upload_time: string;
  payer: {
    openid: string;
  };
};

export type WechatOrderShippingResult = {
  wechat_errcode: number;
  wechat_errmsg: string | null;
};

export class WechatMiniProgramOrderShippingGateway {
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;
  private readonly fetchImpl: FetchPort;
  private readonly requestTimeoutMs: number;

  constructor(dependencies: Dependencies = {}) {
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.requestTimeoutMs = normalizeTimeout(dependencies.requestTimeoutMs);
  }

  async uploadShippingInfo(
    payload: WechatOrderShippingPayload,
  ): Promise<WechatOrderShippingResult> {
    const accessToken = await this.accessTokenProvider.getAccessToken();
    const url = new URL(ORDER_SHIPPING_ENDPOINT);
    url.searchParams.set("access_token", accessToken);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw Errors.business(
          504,
          "微信发货信息上报请求超时",
          "WECHAT_ORDER_SHIPPING_UPLOAD_TIMEOUT",
        );
      }
      throw Errors.business(
        502,
        "微信发货信息上报请求失败",
        "WECHAT_ORDER_SHIPPING_UPLOAD_TRANSPORT_FAILED",
      );
    }

    const result = await parseWechatResponse(response);
    if (!response.ok || result.wechat_errcode !== 0) {
      throw Errors.business(
        502,
        "微信发货信息上报被拒绝",
        "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
        {
          httpStatus: response.status,
          wechatErrcode: result.wechat_errcode,
        },
      );
    }
    return result;
  }
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > REQUEST_TIMEOUT_MS) {
    return REQUEST_TIMEOUT_MS;
  }
  return value;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}

async function parseWechatResponse(
  response: Response,
): Promise<WechatOrderShippingResult> {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidWechatResponse(response);
    }
    const record = payload as Record<string, unknown>;
    const errcode = Number(record.errcode);
    if (!Number.isSafeInteger(errcode)) return invalidWechatResponse(response);
    return {
      wechat_errcode: errcode,
      wechat_errmsg: typeof record.errmsg === "string" ? record.errmsg : null,
    };
  } catch {
    return invalidWechatResponse(response);
  }
}

function invalidWechatResponse(response: Response): never {
  throw Errors.business(
    502,
    "微信发货信息上报响应格式不正确",
    "WECHAT_ORDER_SHIPPING_UPLOAD_INVALID_RESPONSE",
    { httpStatus: response.status, wechatErrcode: null },
  );
}

export const wechatMiniProgramOrderShippingGateway =
  new WechatMiniProgramOrderShippingGateway();
