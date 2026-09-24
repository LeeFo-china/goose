import type { TenantDeviceAsset } from "@/components/cameras/camera-types";

export type Gb28181BindingInput = {
  name: string;
  deviceId: string;
  channelId: string;
  deviceCode?: string | null;
  channelCode?: string | null;
};

export function buildGb28181CameraPayload(input: Gb28181BindingInput) {
  return {
    name: input.name.trim(),
    position: null,
    vendor: "tencent_iotvideo_industry" as const,
    vendor_device_serial: input.deviceId,
    vendor_channel_id: input.channelId,
    vendor_device_code: input.deviceCode ?? null,
    vendor_channel_code: input.channelCode ?? null,
    channel_no: 1,
    can_view: true,
    can_control: false,
    capabilities: ["live"] as const,
    cover_url: null,
    sort_order: 0,
    remark: null,
    video_encrypted: false,
    play_protocol: "flv" as const,
  };
}

export function findGb28181Channels(
  assets: TenantDeviceAsset[],
  deviceId: string,
) {
  return assets.filter((asset) => (
    asset.vendor === "tencent_iotvideo_industry"
    && asset.vendor_device_serial === deviceId
    && Boolean(asset.vendor_channel_id)
    && !asset.bound_camera_id
    && !asset.bound_project_id
  ));
}

export type Gb28181ChannelDecision =
  | { kind: "not-found" }
  | { kind: "selected"; channel: TenantDeviceAsset }
  | { kind: "choose"; channels: TenantDeviceAsset[] };

export function decideGb28181Channel(
  channels: TenantDeviceAsset[],
): Gb28181ChannelDecision {
  if (channels.length === 0) return { kind: "not-found" };
  if (channels.length === 1) return { kind: "selected", channel: channels[0] };
  return { kind: "choose", channels };
}
