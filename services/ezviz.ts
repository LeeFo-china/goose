import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { ezvizAccessTokenRepository } from "@/repositories/ezviz-access-tokens";

export type EzvizAccessToken = {
  access_token: string;
  expires_at: string;
};

type EzvizTokenResponse = {
  code?: string;
  msg?: string;
  data?: {
    accessToken?: string;
    expireTime?: number;
  };
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw Errors.business(
      503,
      "监控服务暂时不可用",
      ErrorCodes.EZVIZ_TOKEN_ERROR,
    );
  }

  return value;
}

function getEzvizApiBaseUrl() {
  return process.env.EZVIZ_API_BASE_URL?.trim() || "https://open.ys7.com";
}

function getTokenRefreshAheadMs() {
  const raw = Number(process.env.EZVIZ_TOKEN_REFRESH_AHEAD_MS || 10 * 60 * 1000);
  return Number.isFinite(raw) && raw > 0 ? raw : 10 * 60 * 1000;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function buildEzvizTokenUrl() {
  return `${normalizeBaseUrl(getEzvizApiBaseUrl())}/api/lapp/token/get`;
}

export function getEzplayerPluginVersion() {
  return process.env.EZPLAYER_PLUGIN_VERSION?.trim() || "1.5.2";
}

export function buildEzvizLiveUrl(deviceSerial: string, channelNo = 1) {
  const safeSerial = encodeURIComponent(deviceSerial);
  return `rtmp://open.ys7.com/${safeSerial}/${channelNo}/live`;
}

async function requestEzvizAccessToken(): Promise<EzvizAccessToken> {
  const appKey = getRequiredEnv("EZVIZ_APP_KEY");
  const appSecret = getRequiredEnv("EZVIZ_APP_SECRET");
  const body = new URLSearchParams({
    appKey,
    appSecret,
  });

  let response: Response;
  try {
    response = await fetch(buildEzvizTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    throw Errors.business(
      503,
      "监控服务暂时不可用",
      ErrorCodes.EZVIZ_TOKEN_ERROR,
      error instanceof Error ? { message: error.message } : undefined,
    );
  }

  const result = await response.json().catch(() => ({})) as EzvizTokenResponse;
  if (
    !response.ok ||
    result.code !== "200" ||
    !result.data?.accessToken ||
    !result.data?.expireTime
  ) {
    throw Errors.business(
      503,
      "监控服务暂时不可用",
      ErrorCodes.EZVIZ_TOKEN_ERROR,
      {
        status: response.status,
        code: result.code,
        msg: result.msg,
      },
    );
  }

  return {
    access_token: result.data.accessToken,
    expires_at: new Date(result.data.expireTime).toISOString(),
  };
}

export class EzvizTokenService {
  async getValidAccessToken(): Promise<EzvizAccessToken> {
    const minExpiresAt = new Date(Date.now() + getTokenRefreshAheadMs());
    const cached = await ezvizAccessTokenRepository.findLatestValid(minExpiresAt);

    if (cached) {
      return {
        access_token: cached.access_token,
        expires_at: cached.expires_at,
      };
    }

    const token = await requestEzvizAccessToken();
    await ezvizAccessTokenRepository.create(token);
    return token;
  }
}

export const ezvizTokenService = new EzvizTokenService();
