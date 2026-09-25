import { assertTenantDeviceAccess } from "./access";
import {
  buildEzvizLiveUrl,
  ezvizTokenService,
  getEzplayerPluginVersion,
  type EzvizAccessToken,
} from "@/services/ezviz";
import {
  ErrorCodes,
  Errors,
  tenantDeviceRepository,
  tencentIotVideoService,
  type AuthContext,
  type TenantDeviceRow,
} from "./shared";

type TenantDevicePlaybackDependencies = {
  assertAccess(authContext: AuthContext): string;
  findById(id: string, tenantId: string): Promise<TenantDeviceRow | null>;
  getLiveStreamUrl(input: {
    deviceId: string;
    channelId: string;
  }): Promise<{
    flv_url: string | null;
    rtmp_url: string | null;
    hls_url: string | null;
    rtsp_url: string | null;
    request_id: string | null;
  }>;
  getEzvizAccessToken(): Promise<EzvizAccessToken>;
  getEzplayerPluginVersion(): Promise<string>;
  buildEzvizLiveUrl(deviceSerial: string, channelNo: number): string;
};

const defaultDependencies: TenantDevicePlaybackDependencies = {
  assertAccess: (authContext) => assertTenantDeviceAccess(authContext, "project.read"),
  findById: (id, tenantId) => tenantDeviceRepository.findById(id, tenantId),
  getLiveStreamUrl: (input) => tencentIotVideoService.getLiveStreamUrl(input),
  getEzvizAccessToken: () => ezvizTokenService.getValidAccessToken(),
  getEzplayerPluginVersion,
  buildEzvizLiveUrl,
};

export async function getTenantDevicePlayParams(
  input: { authContext: AuthContext; id: string },
  dependencyOverrides: Partial<TenantDevicePlaybackDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const tenantId = dependencies.assertAccess(input.authContext);
  const device = await dependencies.findById(input.id, tenantId);
  if (!device) {
    throw Errors.business(404, "设备资产不存在", ErrorCodes.CAMERA_NOT_FOUND);
  }
  if (device.status === "offline") {
    throw Errors.business(409, "设备当前离线", ErrorCodes.CAMERA_OFFLINE);
  }

  if (device.vendor === "ezviz") {
    const metadata = device.metadata
      && typeof device.metadata === "object"
      && !Array.isArray(device.metadata)
      ? device.metadata as Record<string, unknown>
      : {};
    const channelNoValue = Number(metadata.channel_no || 1);
    const channelNo = Number.isInteger(channelNoValue) && channelNoValue > 0
      ? channelNoValue
      : 1;
    const [token, pluginVersion] = await Promise.all([
      dependencies.getEzvizAccessToken(),
      dependencies.getEzplayerPluginVersion(),
    ]);

    return {
      camera: {
        id: device.id,
        vendor: device.vendor,
        name: device.hardware_serial
          || device.vendor_channel_name
          || device.vendor_device_name
          || device.vendor_device_serial,
        position: null,
        status: "online",
        can_view: true,
        can_control: false,
        capabilities: ["live"],
        cover_url: null,
        sort_order: 0,
        video_encrypted: Boolean(metadata.video_encrypted),
        play_protocol: "rtmp",
      },
      player: {
        provider: "ezplayer",
        plugin_version: pluginVersion,
        access_token: token.access_token,
        play_url: dependencies.buildEzvizLiveUrl(
          device.vendor_device_serial,
          channelNo,
        ),
        expires_at: token.expires_at,
      },
    };
  }

  if (device.vendor !== "tencent_iotvideo_industry") {
    throw Errors.badRequest("当前设备暂不支持资产预览");
  }
  if (!device.vendor_channel_id) {
    throw Errors.business(
      409,
      "设备尚未同步出可播放通道",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
    );
  }

  const liveStream = await dependencies.getLiveStreamUrl({
    deviceId: device.vendor_device_serial,
    channelId: device.vendor_channel_id,
  });
  const primaryUrl = liveStream.hls_url || liveStream.flv_url || liveStream.rtmp_url;
  if (!primaryUrl) {
    throw Errors.business(
      503,
      "腾讯云播放地址为空",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      { request_id: liveStream.request_id },
    );
  }

  return {
    camera: {
      id: device.id,
      vendor: device.vendor,
      name: device.hardware_serial
        || device.vendor_channel_name
        || device.vendor_device_name
        || device.vendor_device_serial,
      position: null,
      status: "online",
      can_view: true,
      can_control: false,
      capabilities: ["live"],
      cover_url: null,
      sort_order: 0,
      video_encrypted: false,
      play_protocol: liveStream.hls_url ? "hls" : liveStream.flv_url ? "flv" : "rtmp",
    },
    player: {
      provider: "tencent_iot_video_industry",
      protocol: liveStream.hls_url ? "hls" : liveStream.flv_url ? "flv" : "rtmp",
      src: primaryUrl,
      flv_url: liveStream.flv_url,
      rtmp_url: liveStream.rtmp_url,
      hls_url: liveStream.hls_url,
      rtsp_url: liveStream.rtsp_url,
      request_id: liveStream.request_id,
      expires_at: null,
    },
  };
}
