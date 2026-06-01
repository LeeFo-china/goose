import { createHash, createHmac } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

const API_VERSION = "2020-12-01";
const SERVICE = "iotvideoindustry";
const DEFAULT_ENDPOINT = "iotvideoindustry.tencentcloudapi.com";
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

type TencentApiError = {
  Code?: string;
  Message?: string;
};

type TencentApiResponse<T> = {
  Response?: T & {
    Error?: TencentApiError;
    RequestId?: string;
  };
};

type TencentDeviceRecord = {
  DeviceId?: string;
  DeviceCode?: string;
  NickName?: string;
  Status?: number | string;
  DeviceType?: number;
  Protocol?: string;
  GroupId?: string;
  GroupName?: string;
  ExtraInformation?: string;
};

type TencentChannelRecord = {
  DeviceId?: string;
  ChannelId?: string;
  ChannelCode?: string;
  ChannelName?: string;
  ChannelType?: number;
  Status?: number | string;
  IsRecord?: number;
  ExtraInformation?: string;
  BusinessGroupId?: string;
};

type DescribeDeviceListResponse = {
  Devices?: TencentDeviceRecord[];
  TotalCount?: number;
  RequestId?: string;
};

type DescribeChannelsResponse = {
  Channels?: TencentChannelRecord[];
  TotalCount?: number;
  RequestId?: string;
};

type TencentSipServerRecord = {
  Host?: string;
  Port?: number;
  Serial?: string;
  Realm?: string;
};

type DescribeSipServerResponse = TencentSipServerRecord & {
  Data?: TencentSipServerRecord;
  ServerConfiguration?: TencentSipServerRecord;
  SipServer?: TencentSipServerRecord;
  RequestId?: string;
};

type CreateDeviceResponse = {
  DeviceCode?: string;
  DeviceId?: string;
  VirtualGroupId?: string;
  RequestId?: string;
};

type DescribeDevicePasswordResponse = {
  PassWord?: string;
  RequestId?: string;
};

type UpdateDevicePasswordResponse = {
  Status?: string;
  RequestId?: string;
};

type DeleteDeviceResponse = {
  RequestId?: string;
};

type DescribeChannelLiveStreamURLResponse = {
  Data?: {
    RtspAddr?: string;
    RtmpAddr?: string;
    HlsAddr?: string;
    FlvAddr?: string;
  };
  RequestId?: string;
};

export type TencentIotVideoDeviceChannel = {
  device_id: string;
  device_code: string | null;
  device_name: string | null;
  device_type: number | null;
  channel_id: string;
  channel_code: string | null;
  channel_name: string;
  channel_type: number | null;
  status: "online" | "offline" | "unknown";
  raw_status: number | string | null;
  protocol: string | null;
  group_id: string | null;
  group_name: string | null;
};

export type TencentIotVideoDevice = {
  device_id: string;
  device_code: string | null;
  device_name: string | null;
  device_type: number | null;
  status: "online" | "offline" | "unknown";
  raw_status: number | string | null;
  protocol: string | null;
  group_id: string | null;
  group_name: string | null;
};

export type TencentIotVideoSipServerConfig = {
  sip_server_id: string | null;
  sip_domain: string | null;
  sip_host: string | null;
  sip_port: number | null;
  transport_protocol: "TCP";
  request_id: string | null;
};

export type TencentIotVideoCreatedDevice = {
  device_id: string | null;
  device_code: string | null;
  virtual_group_id: string | null;
  request_id: string | null;
};

export type TencentIotVideoDevicePassword = {
  password: string | null;
  request_id: string | null;
};

export type TencentIotVideoPasswordUpdate = {
  status: string | null;
  request_id: string | null;
};

export type TencentIotVideoDeleteDeviceResult = {
  request_id: string | null;
};

export type TencentIotVideoLiveStream = {
  request_id: string | null;
  rtmp_url: string | null;
  hls_url: string | null;
  flv_url: string | null;
  rtsp_url: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function formatUtcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
    DEFAULT_ENDPOINT;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStatus(value: number | string | null | undefined) {
  if (value === 1 || value === 3 || value === "1" || value === "3" || value === "online") {
    return "online" as const;
  }

  if (value === 0 || value === "0" || value === "offline") {
    return "offline" as const;
  }

  return "unknown" as const;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function getRequiredSecretConfig(key: string) {
  const value = await systemSettingsService.getSecretString(key);
  if (!value) {
    throw Errors.business(
      503,
      "腾讯云监控服务暂未配置",
      ErrorCodes.TENCENT_IOT_VIDEO_CONFIG_ERROR,
      { key },
    );
  }

  return value;
}

function getTencentErrorMessage(error: TencentApiError | undefined) {
  if (!error) return "腾讯云监控接口调用失败";
  return `${error.Code || "Unknown"}: ${error.Message || "腾讯云监控接口调用失败"}`;
}

function mapTencentApiError(error: TencentApiError | undefined, fallbackCode: string) {
  const code = error?.Code || fallbackCode;
  if (code === "InvalidParameterValue.DeviceOffline") {
    return Errors.business(409, "摄像头当前离线", ErrorCodes.CAMERA_OFFLINE, error);
  }

  if (code === "ResourceNotFound.DeviceNotExist") {
    return Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND, error);
  }

  if (code === "ResourceUnavailable.StreamInfoException") {
    return Errors.business(
      503,
      "视频流信息异常，请稍后重试",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      error,
    );
  }

  if (code === "UnsupportedOperation.DeviceSipCommandFail") {
    return Errors.business(
      503,
      "设备信令不通，请检查国标注册",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      error,
    );
  }

  return Errors.business(
    503,
    getTencentErrorMessage(error),
    fallbackCode,
    error,
  );
}

export class TencentIotVideoService {
  private async getConfig() {
    const [secretId, secretKey, region, endpoint] = await Promise.all([
      getRequiredSecretConfig("TENCENTCLOUD_SECRET_ID"),
      getRequiredSecretConfig("TENCENTCLOUD_SECRET_KEY"),
      systemSettingsService.getString("TENCENT_IOT_VIDEO_REGION", "ap-guangzhou"),
      systemSettingsService.getString("TENCENT_IOT_VIDEO_ENDPOINT", DEFAULT_ENDPOINT),
    ]);

    return {
      secretId,
      secretKey,
      region,
      endpoint: normalizeEndpoint(endpoint),
    };
  }

  private async request<T>(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<T & { RequestId?: string }> {
    const config = await this.getConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const date = formatUtcDate(timestamp);
    const body = JSON.stringify(payload);
    const canonicalHeaders = [
      "content-type:application/json; charset=utf-8",
      `host:${config.endpoint}`,
      `x-tc-action:${action.toLowerCase()}`,
      "",
    ].join("\n");
    const signedHeaders = "content-type;host;x-tc-action";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      sha256(body),
    ].join("\n");
    const credentialScope = `${date}/${SERVICE}/tc3_request`;
    const stringToSign = [
      "TC3-HMAC-SHA256",
      String(timestamp),
      credentialScope,
      sha256(canonicalRequest),
    ].join("\n");
    const secretDate = hmac(`TC3${config.secretKey}`, date);
    const secretService = hmac(secretDate, SERVICE);
    const secretSigning = hmac(secretService, "tc3_request");
    const signature = hmacHex(secretSigning, stringToSign);
    const authorization = `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let response: Response;
    try {
      response = await fetch(`https://${config.endpoint}`, {
        method: "POST",
        headers: {
          "Authorization": authorization,
          "Content-Type": "application/json; charset=utf-8",
          "Host": config.endpoint,
          "X-TC-Action": action,
          "X-TC-Version": API_VERSION,
          "X-TC-Timestamp": String(timestamp),
          "X-TC-Region": config.region,
        },
        body,
      });
    } catch (error) {
      throw Errors.business(
        503,
        "腾讯云监控服务暂时不可用",
        ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
        error instanceof Error ? { message: error.message } : undefined,
      );
    }

    const result = await response.json().catch(() => ({})) as TencentApiResponse<T>;
    const apiResponse = result.Response;
    if (!response.ok || apiResponse?.Error || !apiResponse) {
      throw mapTencentApiError(
        apiResponse?.Error,
        ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
      );
    }

    return apiResponse;
  }

  async listDevices(keyword?: string | null) {
    const devices: TencentDeviceRecord[] = [];
    const normalizedKeyword = keyword?.trim();

    for (let offset = 0; offset < MAX_PAGES * PAGE_SIZE; offset += PAGE_SIZE) {
      const response = await this.request<DescribeDeviceListResponse>(
        "DescribeDeviceList",
        {
          Offset: offset,
          Limit: PAGE_SIZE,
          ...(normalizedKeyword ? { NickName: normalizedKeyword } : {}),
        },
      );
      const pageDevices = Array.isArray(response.Devices) ? response.Devices : [];
      devices.push(...pageDevices);

      const total = typeof response.TotalCount === "number" ? response.TotalCount : null;
      if (pageDevices.length < PAGE_SIZE || (total !== null && devices.length >= total)) {
        break;
      }
    }

    return devices;
  }

  async listDeviceSummaries(keyword?: string | null): Promise<TencentIotVideoDevice[]> {
    const devices = await this.listDevices(keyword);
    return devices
      .map((device) => {
        const deviceId = readString(device.DeviceId);
        if (!deviceId) return null;

        return {
          device_id: deviceId,
          device_code: readString(device.DeviceCode),
          device_name:
            readString(device.NickName) ||
            readString(device.ExtraInformation) ||
            readString(device.DeviceCode),
          device_type: typeof device.DeviceType === "number" ? device.DeviceType : null,
          status: normalizeStatus(device.Status ?? null),
          raw_status: device.Status ?? null,
          protocol: readString(device.Protocol),
          group_id: readString(device.GroupId),
          group_name: readString(device.GroupName),
        };
      })
      .filter((device): device is TencentIotVideoDevice => Boolean(device));
  }

  async findDeviceSummary(deviceId: string): Promise<TencentIotVideoDevice | null> {
    const devices = await this.listDeviceSummaries();
    return devices.find((device) => device.device_id === deviceId) || null;
  }

  async getSipServerConfig(): Promise<TencentIotVideoSipServerConfig> {
    const response = await this.request<DescribeSipServerResponse>(
      "DescribeSIPServer",
      {},
    );
    const record =
      response.Data ||
      response.ServerConfiguration ||
      response.SipServer ||
      response;
    const serial = readString(record.Serial);

    return {
      sip_server_id: serial,
      sip_domain: readString(record.Realm) || serial?.slice(0, 10) || null,
      sip_host: readString(record.Host),
      sip_port: readNumber(record.Port),
      transport_protocol: "TCP",
      request_id: response.RequestId || null,
    };
  }

  async createDevice(input: {
    name: string;
    password: string;
    deviceType: number;
    groupId?: string | null;
  }): Promise<TencentIotVideoCreatedDevice> {
    const response = await this.request<CreateDeviceResponse>(
      "CreateDevice",
      {
        NickName: input.name,
        PassWord: input.password,
        DeviceType: input.deviceType,
        ...(input.groupId ? { GroupId: input.groupId } : {}),
      },
    );

    return {
      device_id: readString(response.DeviceId),
      device_code: readString(response.DeviceCode),
      virtual_group_id: readString(response.VirtualGroupId),
      request_id: response.RequestId || null,
    };
  }

  async getDevicePassword(deviceId: string): Promise<TencentIotVideoDevicePassword> {
    const response = await this.request<DescribeDevicePasswordResponse>(
      "DescribeDevicePassWord",
      {
        DeviceId: deviceId,
      },
    );

    return {
      password: readString(response.PassWord),
      request_id: response.RequestId || null,
    };
  }

  async updateDevicePassword(input: {
    deviceId: string;
    password: string;
  }): Promise<TencentIotVideoPasswordUpdate> {
    const response = await this.request<UpdateDevicePasswordResponse>(
      "UpdateDevicePassWord",
      {
        DeviceId: input.deviceId,
        PassWord: input.password,
      },
    );

    return {
      status: readString(response.Status),
      request_id: response.RequestId || null,
    };
  }

  async deleteDevice(deviceId: string): Promise<TencentIotVideoDeleteDeviceResult> {
    const response = await this.request<DeleteDeviceResponse>(
      "DeleteDevice",
      {
        DeviceId: deviceId,
      },
    );

    return {
      request_id: response.RequestId || null,
    };
  }

  async listChannels(deviceId: string) {
    const channels: TencentChannelRecord[] = [];

    for (let offset = 0; offset < MAX_PAGES * PAGE_SIZE; offset += PAGE_SIZE) {
      const response = await this.request<DescribeChannelsResponse>(
        "DescribeChannels",
        {
          DeviceId: deviceId,
          Offset: offset,
          Limit: PAGE_SIZE,
          ChannelTypes: [1],
        },
      );
      const pageChannels = Array.isArray(response.Channels) ? response.Channels : [];
      channels.push(...pageChannels);

      const total = typeof response.TotalCount === "number" ? response.TotalCount : null;
      if (pageChannels.length < PAGE_SIZE || (total !== null && channels.length >= total)) {
        break;
      }
    }

    return channels;
  }

  async listDeviceChannels(keyword?: string | null): Promise<TencentIotVideoDeviceChannel[]> {
    const devices = await this.listDevices(keyword);
    const rows: TencentIotVideoDeviceChannel[] = [];

    for (const device of devices) {
      const deviceId = readString(device.DeviceId);
      if (!deviceId) continue;

      const channels = await this.listChannels(deviceId);
      for (const channel of channels) {
        const channelId = readString(channel.ChannelId);
        if (!channelId) continue;

        const rawStatus = channel.Status ?? device.Status ?? null;
        const deviceName =
          readString(device.NickName) ||
          readString(device.ExtraInformation) ||
          readString(device.DeviceCode);
        const channelName =
          readString(channel.ChannelName) ||
          readString(channel.ExtraInformation) ||
          readString(channel.ChannelCode) ||
          deviceName ||
          channelId;
        rows.push({
          device_id: deviceId,
          device_code: readString(device.DeviceCode),
          device_name: deviceName,
          device_type: typeof device.DeviceType === "number" ? device.DeviceType : null,
          channel_id: channelId,
          channel_code: readString(channel.ChannelCode),
          channel_name: channelName,
          channel_type: typeof channel.ChannelType === "number" ? channel.ChannelType : null,
          status: normalizeStatus(rawStatus),
          raw_status: rawStatus,
          protocol: readString(device.Protocol),
          group_id: readString(device.GroupId),
          group_name: readString(device.GroupName),
        });
      }
    }

    return rows;
  }

  async getLiveStreamUrl(input: {
    deviceId: string;
    channelId: string;
  }): Promise<TencentIotVideoLiveStream> {
    const preferredAction = await systemSettingsService.getString(
      "TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION",
      "DescribeChannelLiveStreamURL",
    );
    const actions = Array.from(new Set([
      preferredAction,
      "DescribeChannelStreamURL",
    ])).filter(Boolean);
    let lastError: unknown;

    for (const action of actions) {
      try {
        const response = await this.request<DescribeChannelLiveStreamURLResponse>(
          action,
          {
            DeviceId: input.deviceId,
            ChannelId: input.channelId,
            ExpireTime: 0,
          },
        );

        return {
          request_id: response.RequestId || null,
          rtmp_url: readString(response.Data?.RtmpAddr),
          hls_url: readString(response.Data?.HlsAddr),
          flv_url: readString(response.Data?.FlvAddr),
          rtsp_url: readString(response.Data?.RtspAddr),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : Errors.business(
        503,
        "腾讯云播放地址获取失败",
        ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      );
  }
}

export const tencentIotVideoService = new TencentIotVideoService();
