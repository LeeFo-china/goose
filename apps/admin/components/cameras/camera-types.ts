export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CameraProjectOption = {
  id: string;
  name: string | null;
  status?: string | null;
  customer_name?: string | null;
  address?: string | null;
};

export type CameraRecord = {
  id: string;
  name: string;
  position: string | null;
  status: "online" | "offline" | "unknown" | string;
  can_view: boolean;
  can_control: boolean;
  capabilities: string[];
  cover_url: string | null;
  sort_order: number;
  video_encrypted: boolean;
};

export type EzvizDeviceChannel = {
  device_name: string | null;
  device_serial: string;
  channel_no: number;
  channel_name: string | null;
  status: "online" | "offline" | "unknown" | string;
  raw_status: number | string | null;
  video_encrypted: boolean;
  cover_url: string | null;
  is_bound: boolean;
  is_bound_to_current_project: boolean;
  bound_project_id: string | null;
  bound_project_name: string | null;
  bound_camera_id: string | null;
  bound_camera_name: string | null;
  can_bind: boolean;
};
