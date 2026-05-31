import type { CameraProjectOption, TenantDeviceAsset } from "@/components/cameras/camera-types";

export type CameraMode = "create" | "edit";

export type PlayParams = {
  camera?: {
    id: string;
    name: string;
    status: string;
    can_control: boolean;
    capabilities: string[];
  };
  player?: {
    provider: string;
    plugin_version?: string;
    access_token?: string;
    play_url?: string;
    protocol?: string;
    src?: string;
    flv_url?: string | null;
    rtmp_url?: string | null;
    hls_url?: string | null;
    rtsp_url?: string | null;
    request_id?: string | null;
    expires_at?: string | null;
  };
};

export type PreviewSource = {
  label: string;
  protocol: string;
  url: string;
  previewable: boolean;
};

export type CameraBindProjectOptionsData = {
  list?: CameraProjectOption[];
};

export type TenantDeviceListData = {
  list?: TenantDeviceAsset[];
};
