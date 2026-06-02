import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateProjectCameraInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraVendor,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

export type ProjectCameraRow = {
  id: string;
  tenant_id: string | null;
  project_id: string;
  vendor: ProjectCameraVendor;
  vendor_device_serial: string;
  vendor_channel_id: string | null;
  vendor_device_code: string | null;
  vendor_channel_code: string | null;
  channel_no: number;
  play_protocol: "flv" | "rtmp" | "hls";
  name: string;
  position: string | null;
  status: "online" | "offline" | "unknown";
  can_view: boolean;
  can_control: boolean;
  capabilities: unknown;
  cover_url: string | null;
  sort_order: number;
  remark: string | null;
  video_encrypted: boolean;
  last_status_checked_at: string | null;
  last_status_error: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CameraAccessLogAction = "list" | "play_params" | "refresh_status" | "control";

export type ProjectCameraBindingRow = Pick<
  ProjectCameraRow,
  | "id"
  | "project_id"
  | "vendor"
  | "vendor_device_serial"
  | "vendor_channel_id"
  | "vendor_device_code"
  | "vendor_channel_code"
  | "channel_no"
  | "name"
> & {
  tenant_id: string | null;
  project?: {
    id?: string | null;
    name?: string | null;
  } | Array<{
    id?: string | null;
    name?: string | null;
  }> | null;
};

export type ProjectCameraBindProjectRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  status: string | null;
  address: string | null;
  customer_id: string | null;
  property_id: string | null;
  customer?: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
  } | Array<{
    id?: string | null;
    name?: string | null;
    phone?: string | null;
  }> | null;
  property?: {
    id?: string | null;
    community?: string | null;
    building_info?: string | null;
    layout?: string | null;
    area?: number | null;
  } | Array<{
    id?: string | null;
    community?: string | null;
    building_info?: string | null;
    layout?: string | null;
    area?: number | null;
  }> | null;
};

export type ProjectCameraProjectGroupRow = {
  project: ReturnType<typeof serializeBindProjectOption>;
  cameras: ProjectCameraRow[];
};

export type CustomerOwnedProjectTenantRow = {
  tenant_id: string | null;
};

export type ProjectCameraWithProjectRow = ProjectCameraRow & {
  project?: ProjectCameraBindProjectRow | ProjectCameraBindProjectRow[] | null;
};

export function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function cleanSearchKeyword(value: string | null | undefined) {
  return (value || "")
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function maskPhone(phone: string | null | undefined) {
  const normalized = (phone || "").trim();
  if (!normalized) return null;
  if (normalized.length <= 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function buildPropertyAddress(row: ProjectCameraBindProjectRow) {
  const property = firstRelation(row.property);
  return [
    property?.community,
    property?.building_info,
  ].filter(Boolean).join(" ") || row.address || null;
}

export function serializeBindProjectOption(row: ProjectCameraBindProjectRow) {
  const customer = firstRelation(row.customer);
  const property = firstRelation(row.property);
  const address = buildPropertyAddress(row);
  const name = row.name || address || "未命名项目";
  const customerName = customer?.name || null;

  return {
    id: row.id,
    label: [address || name, customerName].filter(Boolean).join(" · "),
    name,
    status: row.status || null,
    customer_name: customerName,
    phone_masked: maskPhone(customer?.phone),
    address,
    property: property
      ? {
        id: property.id || null,
        community: property.community || null,
        building_info: property.building_info || null,
        layout: property.layout || null,
        area: property.area ?? null,
      }
      : null,
  };
}

export { Errors, ErrorCodes, SupabaseDB };
export type {
  CreateProjectCameraInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraVendor,
  UpdateProjectCameraInput,
};
