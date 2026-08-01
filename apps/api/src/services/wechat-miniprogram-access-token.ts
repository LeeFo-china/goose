import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

const TOKEN_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/token";
const MAX_ACCESS_TOKEN_LENGTH = 4_096;
const DEFAULT_EXPIRES_SECONDS = 7_200;
const EXPIRY_SAFETY_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 8_000;

type SettingsPort = Pick<typeof systemSettingsService, "getSecretString">;
type FetchPort = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type Dependencies = {
  settingsService?: SettingsPort;
  fetchImpl?: FetchPort;
  nowFactory?: () => number;
  requestTimeoutMs?: number;
};

export interface WechatMiniProgramAccessTokenPort {
  getAccessToken(): Promise<string>;
}

export class WechatMiniProgramAccessTokenProvider
  implements WechatMiniProgramAccessTokenPort {
  private readonly settingsService: SettingsPort;
  private readonly fetchImpl: FetchPort;
  private readonly nowFactory: () => number;
  private readonly requestTimeoutMs: number;
  private cached: { token: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(dependencies: Dependencies = {}) {
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nowFactory = dependencies.nowFactory ?? Date.now;
    this.requestTimeoutMs = normalizeTimeout(dependencies.requestTimeoutMs);
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.nowFactory()) {
      return this.cached.token;
    }
    if (this.pending) return this.pending;
    this.pending = this.requestAccessToken();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const [appId, appSecret] = await Promise.all([
      this.settingsService.getSecretString("WECHAT_APPID"),
      this.settingsService.getSecretString("WECHAT_SECRET"),
    ]);
    if (!appId || !appSecret) {
      throw Errors.business(
        409,
        "缺少微信小程序 AppID 或 Secret 配置",
        "WECHAT_MINIPROGRAM_ACCESS_TOKEN_CONFIG_MISSING",
      );
    }
    const url = new URL(TOKEN_ENDPOINT);
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw Errors.business(
          504,
          "获取微信 access_token 请求超时",
          "WECHAT_MINIPROGRAM_ACCESS_TOKEN_TIMEOUT",
        );
      }
      throw Errors.business(
        502,
        "获取微信 access_token 请求失败",
        "WECHAT_MINIPROGRAM_ACCESS_TOKEN_TRANSPORT_FAILED",
      );
    }
    const payload = await parseTokenResponse(response);
    const errcode = Number.isSafeInteger(payload.errcode)
      ? Number(payload.errcode)
      : null;
    if (
      !response.ok ||
      typeof payload.access_token !== "string" ||
      !payload.access_token.trim() ||
      payload.access_token.length > MAX_ACCESS_TOKEN_LENGTH
    ) {
      throw Errors.business(
        502,
        "微信拒绝了 access_token 请求",
        "WECHAT_MINIPROGRAM_ACCESS_TOKEN_REJECTED",
        { httpStatus: response.status, wechatErrcode: errcode },
      );
    }
    const expiresSeconds = Number.isSafeInteger(payload.expires_in)
      ? Math.max(60, Number(payload.expires_in) - EXPIRY_SAFETY_SECONDS)
      : DEFAULT_EXPIRES_SECONDS - EXPIRY_SAFETY_SECONDS;
    this.cached = {
      token: payload.access_token,
      expiresAt: this.nowFactory() + expiresSeconds * 1_000,
    };
    return payload.access_token;
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

async function parseTokenResponse(response: Response): Promise<{
  access_token?: unknown;
  expires_in?: unknown;
  errcode?: unknown;
}> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload;
    }
  } catch {
    // The stable response error below intentionally excludes the raw body.
  }
  throw Errors.business(
    502,
    "微信 access_token 响应格式不正确",
    "WECHAT_MINIPROGRAM_ACCESS_TOKEN_INVALID_RESPONSE",
    { httpStatus: response.status, wechatErrcode: null },
  );
}

export const wechatMiniProgramAccessTokenProvider =
  new WechatMiniProgramAccessTokenProvider({
    settingsService: {
      getSecretString: (key) => systemSettingsService.getSecretString(key),
    },
  });
