import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { ezvizAccessTokenRepository } from "@/repositories/ezviz-access-tokens";
import { systemSettingsService } from "@/services/system-settings";

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

type EzvizListResponse = {
  code?: string;
  msg?: string;
  data?: unknown;
  page?: {
    total?: number | string;
  };
};

type EzvizApiRecord = Record<string, unknown>;

export type EzvizDeviceChannel = {
  device_serial: string;
  device_name: string | null;
  channel_no: number;
  channel_name: string;
  status: "online" | "offline" | "unknown";
  raw_status: number | string | null;
  video_encrypted: boolean;
  cover_url: string | null;
};

async function getRequiredSecretConfig(name: string) {
  const value = await systemSettingsService.getSecretString(name);
  if (!value) {
    throw Errors.business(
      503,
      "监控服务暂时不可用",
      ErrorCodes.EZVIZ_TOKEN_ERROR,
    );
  }

  return value;
}

async function getEzvizApiBaseUrl() {
  return systemSettingsService.getString("EZVIZ_API_BASE_URL", "https://open.ys7.com");
}

async function getTokenRefreshAheadMs() {
  const raw = await systemSettingsService.getNumber(
    "EZVIZ_TOKEN_REFRESH_AHEAD_MS",
    10 * 60 * 1000,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 10 * 60 * 1000;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

async function buildEzvizTokenUrl() {
  return `${normalizeBaseUrl(await getEzvizApiBaseUrl())}/api/lapp/token/get`;
}

async function buildEzvizApiUrl(path: string) {
  return `${normalizeBaseUrl(await getEzvizApiBaseUrl())}${path}`;
}

export async function getEzplayerPluginVersion() {
  return systemSettingsService.getString("EZPLAYER_PLUGIN_VERSION", "1.5.2");
}

export function buildEzvizLiveUrl(deviceSerial: string, channelNo = 1) {
  const safeSerial = encodeURIComponent(deviceSerial);
  return `rtmp://open.ys7.com/${safeSerial}/${channelNo}/live`;
}

async function requestEzvizAccessToken(): Promise<EzvizAccessToken> {
  const appKey = await getRequiredSecretConfig("EZVIZ_APP_KEY");
  const appSecret = await getRequiredSecretConfig("EZVIZ_APP_SECRET");
  const body = new URLSearchParams({
    appKey,
    appSecret,
  });

  let response: Response;
  try {
    response = await fetch(await buildEzvizTokenUrl(), {
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

function readString(record: EzvizApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: EzvizApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readBoolean(record: EzvizApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value === 1;
    }
    if (typeof value === "string") {
      return value === "1" || value.toLowerCase() === "true";
    }
  }

  return false;
}

function normalizeEzvizStatus(value: number | string | null) {
  if (value === 1 || value === "1" || value === "online") {
    return "online" as const;
  }
  if (value === 0 || value === "0" || value === "offline") {
    return "offline" as const;
  }

  return "unknown" as const;
}

function normalizeEzvizListData(data: unknown) {
  if (Array.isArray(data)) {
    return data.filter((item): item is EzvizApiRecord => {
      return item !== null && typeof item === "object" && !Array.isArray(item);
    });
  }

  return [];
}

function normalizeTotal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function postEzvizListApi(path: string, input: {
  accessToken: string;
  pageStart: number;
  pageSize: number;
}) {
  const body = new URLSearchParams({
    accessToken: input.accessToken,
    pageStart: String(input.pageStart),
    pageSize: String(input.pageSize),
  });

  let response: Response;
  try {
    response = await fetch(await buildEzvizApiUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    throw Errors.business(
      503,
      "萤石设备列表暂时不可用",
      ErrorCodes.EZVIZ_DEVICE_LIST_ERROR,
      error instanceof Error ? { message: error.message } : undefined,
    );
  }

  const result = await response.json().catch(() => ({})) as EzvizListResponse;
  if (!response.ok || result.code !== "200") {
    throw Errors.business(
      503,
      "萤石设备列表暂时不可用",
      ErrorCodes.EZVIZ_DEVICE_LIST_ERROR,
      {
        status: response.status,
        code: result.code,
        msg: result.msg,
      },
    );
  }

  return result;
}

async function requestPagedEzvizList(path: string, accessToken: string) {
  const pageSize = 50;
  const maxPages = 10;
  const rows: EzvizApiRecord[] = [];

  for (let pageStart = 0; pageStart < maxPages; pageStart += 1) {
    const result = await postEzvizListApi(path, {
      accessToken,
      pageStart,
      pageSize,
    });
    const pageRows = normalizeEzvizListData(result.data);
    rows.push(...pageRows);

    const total = normalizeTotal(result.page?.total);
    if (pageRows.length < pageSize || (total !== null && rows.length >= total)) {
      break;
    }
  }

  return rows;
}

function serializeEzvizCamera(record: EzvizApiRecord): EzvizDeviceChannel | null {
  const deviceSerial = readString(record, ["deviceSerial", "device_serial"]);
  if (!deviceSerial) {
    return null;
  }

  const channelNo = readNumber(record, ["channelNo", "channel_no"]) || 1;
  const rawStatus = (record.status as number | string | null) ?? null;
  const deviceName = readString(record, ["deviceName", "device_name"]);
  const channelName =
    readString(record, ["channelName", "channel_name", "cameraName"]) ||
    deviceName ||
    `通道 ${channelNo}`;

  return {
    device_serial: deviceSerial,
    device_name: deviceName,
    channel_no: channelNo,
    channel_name: channelName,
    status: normalizeEzvizStatus(rawStatus),
    raw_status: rawStatus,
    video_encrypted: readBoolean(record, [
      "isEncrypt",
      "isEncrypted",
      "isVideoEncrypt",
      "videoEncrypted",
    ]),
    cover_url: readString(record, ["picUrl", "coverUrl", "cover_url"]),
  };
}

function serializeEzvizDevice(record: EzvizApiRecord): EzvizDeviceChannel | null {
  const deviceSerial = readString(record, ["deviceSerial", "device_serial"]);
  if (!deviceSerial) {
    return null;
  }

  const rawStatus = (record.status as number | string | null) ?? null;
  const deviceName = readString(record, ["deviceName", "device_name"]);

  return {
    device_serial: deviceSerial,
    device_name: deviceName,
    channel_no: 1,
    channel_name: deviceName || "通道 1",
    status: normalizeEzvizStatus(rawStatus),
    raw_status: rawStatus,
    video_encrypted: readBoolean(record, [
      "isEncrypt",
      "isEncrypted",
      "isVideoEncrypt",
      "videoEncrypted",
    ]),
    cover_url: readString(record, ["picUrl", "coverUrl", "cover_url"]),
  };
}

export class EzvizTokenService {
  async getValidAccessToken(): Promise<EzvizAccessToken> {
    const minExpiresAt = new Date(Date.now() + await getTokenRefreshAheadMs());
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

export class EzvizDeviceService {
  async listDeviceChannels() {
    const token = await ezvizTokenService.getValidAccessToken();
    let cameraListError: unknown;

    try {
      const cameras = await requestPagedEzvizList(
        "/api/lapp/camera/list",
        token.access_token,
      );
      const channels = cameras
        .map(serializeEzvizCamera)
        .filter((item): item is EzvizDeviceChannel => item !== null);

      if (channels.length > 0) {
        return channels;
      }
    } catch (error) {
      cameraListError = error;
    }

    try {
      const devices = await requestPagedEzvizList(
        "/api/lapp/device/list",
        token.access_token,
      );

      return devices
        .map(serializeEzvizDevice)
        .filter((item): item is EzvizDeviceChannel => item !== null);
    } catch (error) {
      if (cameraListError) {
        throw cameraListError;
      }
      throw error;
    }
  }
}

export const ezvizDeviceService = new EzvizDeviceService();
