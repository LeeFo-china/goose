import { randomBytes, randomInt } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService, type AuthContext } from "@/services/authorization";
import {
  buildEzvizLiveUrl,
  ezvizDeviceService,
  ezvizTokenService,
  getEzplayerPluginVersion,
} from "@/services/ezviz";
import { tencentIotVideoService } from "@/services/tencent-iot-video";
import {
  projectCameraRepository,
  type CameraAccessLogAction,
  type ProjectCameraProjectGroupRow,
  type ProjectCameraRow,
} from "@/repositories/project-cameras";
import { projectRepository } from "@/repositories/projects";
import { tenantDeviceRepository, type TenantDeviceRow } from "@/repositories/tenant-devices";
import { projectStatusService } from "@/services/project-status";
import type {
  CreateProjectCameraInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupsQueryInput,
  CreateProjectCameraTencentDeviceInput,
  UpdateProjectCameraTencentDevicePasswordInput,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

export type CameraActor = {
  userId: string;
  userRole: "customer" | "employee";
  tenantId: string | null;
  authContext?: AuthContext;
};

export type RequestLogMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export function normalizeCapabilities(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeCameraStatus(value: unknown): ProjectCameraRow["status"] {
  if (
    value === "online" ||
    value === "1" ||
    value === 1 ||
    value === true ||
    value === "true" ||
    value === "connected"
  ) {
    return "online";
  }

  if (
    value === "offline" ||
    value === "0" ||
    value === 0 ||
    value === false ||
    value === "false" ||
    value === "disconnected"
  ) {
    return "offline";
  }

  return "unknown";
}

export function withCameraStatus(
  camera: ProjectCameraRow,
  status: ProjectCameraRow["status"],
): ProjectCameraRow {
  return {
    ...camera,
    status,
  };
}

export function serializeCamera(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    vendor: camera.vendor,
    name: camera.name,
    position: camera.position,
    status: normalizeCameraStatus(camera.status),
    can_view: camera.can_view,
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
    cover_url: camera.cover_url,
    sort_order: camera.sort_order,
    video_encrypted: camera.video_encrypted,
    play_protocol: camera.play_protocol,
  };
}

export function serializeCameraForPlayer(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    vendor: camera.vendor,
    name: camera.name,
    status: normalizeCameraStatus(camera.status),
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
  };
}

export function buildDeviceChannelKey(deviceSerial: string, channelNo: number) {
  return `${deviceSerial}:${channelNo}`;
}

export function buildTencentDeviceChannelKey(deviceId: string, channelId: string | null | undefined) {
  return `${deviceId}:${channelId || ""}`;
}

export function buildTenantDeviceChannelKey(
  vendor: string,
  deviceSerial: string,
  channelId?: string | number | null,
) {
  return `${vendor}:${deviceSerial}:${channelId || ""}`;
}

export function createTenantDeviceAssetMap(assets: TenantDeviceRow[]) {
  return new Map(assets.map((asset) => [
    buildTenantDeviceChannelKey(
      asset.vendor,
      asset.vendor_device_serial,
      asset.vendor_channel_id,
    ),
    asset,
  ]));
}

export function serializeAssetState(asset: TenantDeviceRow | null | undefined, tenantId: string | null) {
  const isInTenantAssetPool = Boolean(asset);
  const isAssetOwnedByCurrentTenant = Boolean(asset && asset.tenant_id === tenantId);

  return {
    tenant_device_id: asset?.id || null,
    is_in_tenant_asset_pool: isInTenantAssetPool,
    is_asset_owned_by_current_tenant: isAssetOwnedByCurrentTenant,
    is_asset_owned_by_other_tenant: Boolean(asset && asset.tenant_id !== tenantId),
    can_import_asset: !asset,
  };
}

export function getBindingProject(project: unknown) {
  if (Array.isArray(project)) {
    return project[0] as { id?: string | null; name?: string | null } | undefined;
  }

  if (project && typeof project === "object") {
    return project as { id?: string | null; name?: string | null };
  }

  return undefined;
}

export function getTencentDeviceTypeLabel(value: number | null | undefined) {
  if (value === 2) return "IPC";
  if (value === 3) return "NVR";
  if (value === 1) return "VMS";
  if (value === 9) return "智能告警设备";
  return value == null ? "未知设备" : `类型 ${value}`;
}

export function generateSipPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_";
  const bytes = randomBytes(12);
  let password = "";

  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }

  return password;
}

export function generateDeviceNameFallback(deviceType: number) {
  const prefix = deviceType === 3 ? "NVR" : "IPC";
  return `${prefix}-${randomInt(1000, 9999)}`;
}

export function normalizeDeviceName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function buildUniqueDeviceNameCandidate(baseName: string) {
  const suffix = `-${randomInt(1000, 9999)}`;
  return `${baseName.slice(0, 48 - suffix.length)}${suffix}`;
}

export async function tencentDeviceNameExists(name: string) {
  const normalizedName = normalizeDeviceName(name);
  const devices = await tencentIotVideoService.listDeviceSummaries(normalizedName);
  return devices.some((device) =>
    normalizeDeviceName(device.device_name || "") === normalizedName
  );
}

export function getUserAgent(meta?: RequestLogMeta) {
  return meta?.userAgent || null;
}

export function getIp(meta?: RequestLogMeta) {
  return meta?.ip || null;
}

export function chooseTencentPlayUrl(input: {
  protocol: "flv" | "rtmp" | "hls";
  flvUrl: string | null;
  rtmpUrl: string | null;
  hlsUrl: string | null;
}) {
  if (input.protocol === "rtmp" && input.rtmpUrl) {
    return {
      protocol: "rtmp" as const,
      src: input.rtmpUrl,
    };
  }

  if (input.protocol === "hls" && input.hlsUrl) {
    return {
      protocol: "hls" as const,
      src: input.hlsUrl,
    };
  }

  if (input.flvUrl) {
    return {
      protocol: "flv" as const,
      src: input.flvUrl,
    };
  }

  if (input.rtmpUrl) {
    return {
      protocol: "rtmp" as const,
      src: input.rtmpUrl,
    };
  }

  if (input.hlsUrl) {
    return {
      protocol: "hls" as const,
      src: input.hlsUrl,
    };
  }

  return null;
}

export {
  Errors,
  ErrorCodes,
  accessPolicyService,
  authorizationService,
  buildEzvizLiveUrl,
  ezvizDeviceService,
  ezvizTokenService,
  getEzplayerPluginVersion,
  projectCameraRepository,
  projectRepository,
  projectStatusService,
  tenantDeviceRepository,
  tencentIotVideoService,
};

export type {
  AuthContext,
  CameraAccessLogAction,
  CreateProjectCameraInput,
  CreateProjectCameraTencentDeviceInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupRow,
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraRow,
  TenantDeviceRow,
  UpdateProjectCameraInput,
  UpdateProjectCameraTencentDevicePasswordInput,
};
