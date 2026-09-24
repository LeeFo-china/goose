import type { Pagination, TenantDeviceAsset } from "@/components/cameras/camera-types";

export type Gb28181BindingInput = {
  name: string;
  deviceId: string;
  channelId: string;
  deviceCode?: string | null;
  channelCode?: string | null;
};

export type Gb28181ChannelAsset = TenantDeviceAsset & {
  vendor: "tencent_iotvideo_industry";
  vendor_channel_id: string;
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
  return assets.filter((asset): asset is Gb28181ChannelAsset => (
    asset.vendor === "tencent_iotvideo_industry"
    && asset.vendor_device_serial === deviceId
    && Boolean(asset.vendor_channel_id)
    && !asset.bound_camera_id
    && !asset.bound_project_id
  ));
}

export type Gb28181ChannelDecision =
  | { kind: "not-found" }
  | { kind: "selected"; channel: Gb28181ChannelAsset }
  | { kind: "choose"; channels: Gb28181ChannelAsset[] };

export function decideGb28181Channel(
  channels: Gb28181ChannelAsset[],
): Gb28181ChannelDecision {
  if (channels.length === 0) return { kind: "not-found" };
  if (channels.length === 1) return { kind: "selected", channel: channels[0] };
  return { kind: "choose", channels };
}

export type Gb28181AssetDecision = Gb28181ChannelDecision
  | { kind: "already-bound"; asset: TenantDeviceAsset }
  | { kind: "bound-elsewhere"; asset: TenantDeviceAsset };

export function decideGb28181Assets(
  assets: TenantDeviceAsset[],
  deviceId: string,
  projectId: string,
): Gb28181AssetDecision {
  const deviceAssets = assets.filter((asset) => (
    asset.vendor === "tencent_iotvideo_industry"
    && asset.vendor_device_serial === deviceId
  ));
  const boundAsset = deviceAssets.find((asset) => Boolean(asset.bound_camera_id));

  if (boundAsset?.bound_project_id === projectId) {
    return { kind: "already-bound", asset: boundAsset };
  }
  if (boundAsset) {
    return { kind: "bound-elsewhere", asset: boundAsset };
  }

  return decideGb28181Channel(findGb28181Channels(deviceAssets, deviceId));
}

export function getNextTenantDevicePage(
  pagination: Pagination | null | undefined,
) {
  if (!pagination || pagination.page >= pagination.totalPages) return null;
  return pagination.page + 1;
}
