import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

const DISTRICT_LIST_PATH = "/ws/district/v1/list";
const DISTRICT_LIST_URL = "https://apis.map.qq.com/ws/district/v1/list";
const GEOCODER_PATH = "/ws/geocoder/v1/";
const GEOCODER_URL = "https://apis.map.qq.com/ws/geocoder/v1/";

type TencentDistrictListResponse = {
  status: number;
  message?: string;
  request_id?: string;
  result?: unknown[][];
};

type TencentGeocoderResponse = {
  status: number;
  message?: string;
  request_id?: string;
  result?: {
    title?: string;
    location?: {
      lat?: number;
      lng?: number;
    };
    address_components?: {
      province?: string;
      city?: string;
      district?: string;
    };
    ad_info?: {
      adcode?: string;
    };
    reliability?: number;
    level?: string | number;
  };
};

export type TencentGeocodeResult = {
  ok: boolean;
  address: string;
  message: string;
  request_id: string | null;
  title: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  level: string | null;
};

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

export function buildSignedGetUrl(input: {
  url: string;
  path: string;
  params: Record<string, string>;
  sk?: string;
}) {
  const sortedParams = Object.entries(input.params)
    .filter(([, value]) => value.trim())
    .sort(([left], [right]) => left.localeCompare(right));
  const rawQuery = sortedParams.map(([key, value]) => `${key}=${value}`).join("&");
  const query = new URLSearchParams(sortedParams);
  if (input.sk?.trim()) {
    query.set("sig", md5(`${input.path}?${rawQuery}${input.sk.trim()}`));
  }

  return `${input.url}?${query.toString()}`;
}

function normalizeConfidence(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.max(0, value);
  if (value <= 10) return Math.max(0, Math.min(value / 10, 1));
  return Math.max(0, Math.min(value / 100, 1));
}

function normalizeText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

class TencentLbsService {
  async getConfig() {
    const [webserviceKey, webserviceSk, miniprogramKey] = await Promise.all([
      systemSettingsService.getString("TENCENT_LBS_WEBSERVICE_KEY"),
      systemSettingsService.getSecretString("TENCENT_LBS_WEBSERVICE_SK"),
      systemSettingsService.getString("TENCENT_LBS_MINIPROGRAM_KEY"),
    ]);

    return {
      webserviceKey,
      webserviceSk,
      miniprogramKey,
    };
  }

  async testWebserviceConfig() {
    const config = await this.getConfig();
    if (!config.webserviceKey) {
      throw Errors.badRequest("请先配置腾讯位置服务 WebService Key");
    }

    const response = await fetch(buildSignedGetUrl({
      url: DISTRICT_LIST_URL,
      path: DISTRICT_LIST_PATH,
      params: {
        key: config.webserviceKey,
        output: "json",
      },
      sk: config.webserviceSk,
    }));
    const payload = await response.json().catch(() => ({})) as TencentDistrictListResponse;
    const levelCounts = Array.isArray(payload.result)
      ? payload.result.map((level) => Array.isArray(level) ? level.length : 0)
      : [];

    return {
      ok: response.ok && payload.status === 0,
      status: payload.status ?? response.status,
      message: payload.message || response.statusText || "未知响应",
      request_id: payload.request_id ?? null,
      level_counts: levelCounts,
      has_webservice_key: Boolean(config.webserviceKey),
      has_webservice_sk: Boolean(config.webserviceSk),
      has_miniprogram_key: Boolean(config.miniprogramKey),
    };
  }

  async geocodeAddress(input: {
    address: string;
    region?: string | null;
  }): Promise<TencentGeocodeResult> {
    const config = await this.getConfig();
    const address = input.address.trim();
    if (!config.webserviceKey) {
      return {
        ok: false,
        address,
        message: "腾讯位置服务 WebService Key 未配置",
        request_id: null,
        title: null,
        province: null,
        city: null,
        district: null,
        adcode: null,
        latitude: null,
        longitude: null,
        confidence: null,
        level: null,
      };
    }

    const params: Record<string, string> = {
      address,
      key: config.webserviceKey,
      output: "json",
    };
    if (input.region?.trim()) {
      params.region = input.region.trim();
    }

    const response = await fetch(buildSignedGetUrl({
      url: GEOCODER_URL,
      path: GEOCODER_PATH,
      params,
      sk: config.webserviceSk,
    }), { signal: AbortSignal.timeout(8000) });
    const payload = await response.json().catch(() => ({})) as TencentGeocoderResponse;
    const result = payload.result;
    const latitude = result?.location?.lat;
    const longitude = result?.location?.lng;
    const ok = response.ok &&
      payload.status === 0 &&
      typeof latitude === "number" &&
      typeof longitude === "number";

    return {
      ok,
      address,
      message: payload.message || response.statusText || "未知响应",
      request_id: payload.request_id ?? null,
      title: normalizeText(result?.title),
      province: normalizeText(result?.address_components?.province),
      city: normalizeText(result?.address_components?.city),
      district: normalizeText(result?.address_components?.district),
      adcode: normalizeText(result?.ad_info?.adcode),
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
      confidence: normalizeConfidence(result?.reliability),
      level: result?.level != null ? String(result.level) : null,
    };
  }
}

export const tencentLbsService = new TencentLbsService();
