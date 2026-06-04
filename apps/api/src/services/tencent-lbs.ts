import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

const DISTRICT_LIST_PATH = "/ws/district/v1/list";
const DISTRICT_LIST_URL = "https://apis.map.qq.com/ws/district/v1/list";

type TencentDistrictListResponse = {
  status: number;
  message?: string;
  request_id?: string;
  result?: unknown[][];
};

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function buildSignedGetUrl(input: {
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
}

export const tencentLbsService = new TencentLbsService();
