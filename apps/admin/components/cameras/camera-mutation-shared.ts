import { z } from "zod";
import type { CameraDeviceChannel, CameraProjectOption, CameraRecord, TenantDeviceAsset } from "@/components/cameras/camera-types";
import type { PlayParams, PreviewSource } from "@/components/cameras/camera-mutation-types";

export const CAMERA_CAPABILITY_VALUES = [
  "live",
  "ptz",
  "zoom",
  "talk",
  "playback",
] as const;

export const CameraFormSchema = z.object({
  name: z.string().trim().min(1, "请输入摄像头名称").max(80, "摄像头名称过长"),
  position: z.string().max(80, "位置过长"),
  vendor: z.enum(["ezviz", "tencent_iotvideo_industry"]),
  device_key: z.string(),
  play_protocol: z.enum(["flv", "rtmp", "hls"]),
  can_view: z.enum(["true", "false"]),
  can_control: z.enum(["true", "false"]),
  capabilities: z.array(z.enum(CAMERA_CAPABILITY_VALUES)).min(1, "至少选择一个能力"),
  cover_url: z.string().trim().refine((value) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "封面地址格式不正确"),
  sort_order: z.string().refine((value) => {
    const amount = Number(value || 0);
    return Number.isInteger(amount) && amount >= 0 && amount <= 999999;
  }, "排序值必须是 0 到 999999 的整数"),
  remark: z.string().max(500, "备注过长"),
  video_encrypted: z.enum(["true", "false"]),
});

export type CameraFormValues = z.infer<typeof CameraFormSchema>;

export const capabilityOptions = [
  ["live", "直播"],
  ["ptz", "云台"],
  ["zoom", "变焦"],
  ["talk", "对讲"],
  ["playback", "回放"],
] as const;

export const boolOptions = [
  ["true", "是"],
  ["false", "否"],
] as const;

export const vendorOptions = [
  ["ezviz", "萤石云"],
  ["tencent_iotvideo_industry", "腾讯云行业版"],
] as const;

export const playProtocolOptions = [
  ["flv", "FLV"],
  ["rtmp", "RTMP"],
  ["hls", "HLS"],
] as const;

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestCamera(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data;
}

export function getVendorLabel(vendor: string) {
  if (vendor === "tencent_iotvideo_industry") return "腾讯云行业版";
  if (vendor === "ezviz") return "萤石云";
  return vendor || "未知厂商";
}

export function getProjectOptionLabel(project: CameraProjectOption | null | undefined) {
  if (!project) return "";
  return project.label || [project.address || project.name || "未命名项目", project.customer_name]
    .filter(Boolean)
    .join(" · ");
}

export function getProjectOptionDescription(project: CameraProjectOption) {
  const parts = [
    project.status === "invalid"
      ? "无效项目不可绑定摄像头"
      : project.status === "acceptance"
        ? "竣工验收项目不可绑定摄像头"
        : null,
    project.phone_masked ? `电话 ${project.phone_masked}` : null,
    project.property?.layout || null,
    project.property?.area ? `${project.property.area}㎡` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function canBindCameraToProject(project: CameraProjectOption | null | undefined) {
  return project?.status !== "invalid" && project?.status !== "acceptance";
}

function readAssetChannelNo(asset: TenantDeviceAsset) {
  const value = asset.metadata && typeof asset.metadata === "object"
    ? (asset.metadata as { channel_no?: unknown }).channel_no
    : null;
  const channelNo = Number(value || 1);
  return Number.isInteger(channelNo) && channelNo > 0 ? channelNo : 1;
}

function assetToDeviceChannel(asset: TenantDeviceAsset): CameraDeviceChannel | null {
  if (asset.bound_camera_id) return null;

  if (asset.vendor === "tencent_iotvideo_industry") {
    if (!asset.vendor_channel_id) return null;

    return {
      vendor: "tencent_iotvideo_industry",
      device_id: asset.vendor_device_serial,
      device_code: asset.vendor_device_code,
      device_name: asset.vendor_device_name,
      device_type: null,
      device_type_label: asset.device_type,
      channel_id: asset.vendor_channel_id,
      channel_code: asset.vendor_channel_code,
      channel_name: asset.vendor_channel_name,
      channel_type: null,
      status: asset.status,
      raw_status: asset.raw_status,
      protocol: null,
      group_id: null,
      group_name: null,
      is_bound: false,
      is_bound_to_current_project: false,
      bound_project_id: null,
      bound_project_name: null,
      bound_camera_id: null,
      bound_camera_name: null,
      can_bind: true,
    };
  }

  if (asset.vendor === "ezviz") {
    return {
      vendor: "ezviz",
      device_name: asset.vendor_device_name,
      device_serial: asset.vendor_device_serial,
      channel_no: readAssetChannelNo(asset),
      channel_name: asset.vendor_channel_name,
      status: asset.status,
      raw_status: asset.raw_status,
      video_encrypted: false,
      cover_url: null,
      is_bound: false,
      is_bound_to_current_project: false,
      bound_project_id: null,
      bound_project_name: null,
      bound_camera_id: null,
      bound_camera_name: null,
      can_bind: true,
    };
  }

  return null;
}

export function tenantAssetsToDevices(assets: TenantDeviceAsset[]) {
  return assets
    .map(assetToDeviceChannel)
    .filter((device): device is CameraDeviceChannel => Boolean(device));
}

export function buildDeviceKey(device: CameraDeviceChannel) {
  if (device.vendor === "tencent_iotvideo_industry") {
    return `${device.vendor}::${device.device_id}::${device.channel_id}`;
  }

  return `${device.vendor}::${device.device_serial}::${device.channel_no}`;
}

export function parseDeviceKey(value: string) {
  const [vendor, deviceId, channelIdOrNo] = value.split("::");
  return {
    vendor: vendor === "tencent_iotvideo_industry"
      ? "tencent_iotvideo_industry" as const
      : "ezviz" as const,
    deviceId: deviceId || "",
    deviceSerial: deviceId || "",
    channelId: channelIdOrNo || "",
    channelNo: Number(channelIdOrNo || 1),
  };
}

function compactIdentifier(value: string | null | undefined) {
  if (!value) return "";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatDeviceLabel(device: CameraDeviceChannel) {
  if (device.vendor === "tencent_iotvideo_industry") {
    const deviceName =
      device.device_name ||
      device.device_code ||
      compactIdentifier(device.device_id) ||
      "未命名设备";
    const channelName =
      device.channel_name ||
      device.channel_code ||
      compactIdentifier(device.channel_id) ||
      "未命名通道";
    return `${deviceName} / ${channelName}`;
  }

  const name = [device.device_name, device.channel_name].filter(Boolean).join(" / ");
  return `${name || device.device_serial} · ${device.device_serial} · 通道 ${device.channel_no}`;
}

function addPreviewSource(
  sources: PreviewSource[],
  seen: Set<string>,
  input: {
    label: string;
    protocol: string;
    url?: string | null;
    previewable?: boolean;
  },
) {
  const url = input.url?.trim();
  if (!url || seen.has(url)) return;
  seen.add(url);
  sources.push({
    label: input.label,
    protocol: input.protocol,
    url,
    previewable: input.previewable ?? false,
  });
}

export function getPreviewSources(data: PlayParams): PreviewSource[] {
  const player = data.player;
  const sources: PreviewSource[] = [];
  const seen = new Set<string>();

  addPreviewSource(sources, seen, {
    label: "HLS",
    protocol: "hls",
    url: player?.hls_url || (player?.protocol === "hls" ? player.src || player.play_url : null),
    previewable: true,
  });
  addPreviewSource(sources, seen, {
    label: "FLV",
    protocol: "flv",
    url: player?.flv_url || (player?.protocol === "flv" ? player.src || player.play_url : null),
  });
  addPreviewSource(sources, seen, {
    label: "播放地址",
    protocol: player?.protocol || "url",
    url: player?.src || player?.play_url,
    previewable: player?.protocol === "hls",
  });
  addPreviewSource(sources, seen, {
    label: "RTMP",
    protocol: "rtmp",
    url: player?.rtmp_url,
  });
  addPreviewSource(sources, seen, {
    label: "RTSP",
    protocol: "rtsp",
    url: player?.rtsp_url,
  });

  return sources;
}

export function buildDefaults(camera?: CameraRecord): CameraFormValues {
  return {
    name: camera?.name || "",
    position: camera?.position || "",
    vendor: camera?.vendor === "tencent_iotvideo_industry" ? "tencent_iotvideo_industry" : "ezviz",
    device_key: "",
    play_protocol: camera?.play_protocol === "rtmp" || camera?.play_protocol === "hls"
      ? camera.play_protocol
      : "flv",
    can_view: camera?.can_view === false ? "false" : "true",
    can_control: camera?.can_control ? "true" : "false",
    capabilities: camera?.capabilities?.length
      ? camera.capabilities.filter((item): item is CameraFormValues["capabilities"][number] =>
        CAMERA_CAPABILITY_VALUES.includes(item as CameraFormValues["capabilities"][number])
      )
      : ["live"],
    cover_url: camera?.cover_url || "",
    sort_order: camera?.sort_order != null ? String(camera.sort_order) : "0",
    remark: "",
    video_encrypted: camera?.video_encrypted ? "true" : "false",
  };
}

export function toBoolean(value: "true" | "false") {
  return value === "true";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
