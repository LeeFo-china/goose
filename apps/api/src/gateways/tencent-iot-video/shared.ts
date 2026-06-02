import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
export { ErrorCodes, Errors };
export { systemSettingsService } from "@/services/system-settings";

export const API_VERSION = "2020-12-01";
export const SERVICE = "iotvideoindustry";
export const DEFAULT_ENDPOINT = "iotvideoindustry.tencentcloudapi.com";
export const MAX_PAGES = 10;
export const PAGE_SIZE = 50;

export type TencentApiError = {
  Code?: string;
  Message?: string;
};

export type TencentApiResponse<T> = {
  Response?: T & {
    Error?: TencentApiError;
    RequestId?: string;
  };
};

export type TencentDeviceRecord = {
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

export type TencentChannelRecord = {
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

export type DescribeDeviceListResponse = {
  Devices?: TencentDeviceRecord[];
  TotalCount?: number;
  RequestId?: string;
};

export type DescribeChannelsResponse = {
  Channels?: TencentChannelRecord[];
  TotalCount?: number;
  RequestId?: string;
};

export type TencentSipServerRecord = {
  Host?: string;
  Port?: number;
  Serial?: string;
  Realm?: string;
};

export type DescribeSipServerResponse = TencentSipServerRecord & {
  Data?: TencentSipServerRecord;
  ServerConfiguration?: TencentSipServerRecord;
  SipServer?: TencentSipServerRecord;
  RequestId?: string;
};

export type CreateDeviceResponse = {
  DeviceCode?: string;
  DeviceId?: string;
  VirtualGroupId?: string;
  RequestId?: string;
};

export type DescribeDevicePasswordResponse = {
  PassWord?: string;
  RequestId?: string;
};

export type UpdateDevicePasswordResponse = {
  Status?: string;
  RequestId?: string;
};

export type DeleteDeviceResponse = {
  RequestId?: string;
};

export type DescribeChannelLiveStreamURLResponse = {
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

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeStatus(value: number | string | null | undefined) {
  if (value === 1 || value === 3 || value === "1" || value === "3" || value === "online") {
    return "online" as const;
  }

  if (value === 0 || value === "0" || value === "offline") {
    return "offline" as const;
  }

  return "unknown" as const;
}

export function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
