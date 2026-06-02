export { Errors } from "@/errors/error-factory";
export { ErrorCodes } from "@/errors/error-codes";
export type { ProjectCameraRow } from "@/repositories/project-cameras";
export type { ProjectCameraVendor } from "@/schema/project-cameras";
export type {
  CreateTenantDeviceInput,
  PlatformTenantDeviceListQueryInput,
  TenantDeviceListQueryInput,
  TenantDeviceStatus,
  UpdateTenantDeviceInput,
} from "@/schema/tenant-devices";
export { SupabaseDB } from "@/utils/supabase";
import { SupabaseDB } from "@/utils/supabase";
import type { ProjectCameraVendor } from "@/schema/project-cameras";
import type { TenantDeviceStatus } from "@/schema/tenant-devices";

export type TenantDeviceRow = {
  id: string;
  tenant_id: string;
  vendor: ProjectCameraVendor;
  vendor_device_serial: string;
  vendor_device_code: string | null;
  vendor_device_name: string | null;
  vendor_channel_id: string | null;
  vendor_channel_code: string | null;
  vendor_channel_name: string | null;
  device_type: string | null;
  source_project_id: string | null;
  bound_project_id: string | null;
  bound_camera_id: string | null;
  status: TenantDeviceStatus;
  raw_status: string | null;
  metadata: unknown;
  created_by: string | null;
  updated_by: string | null;
  last_synced_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantDeviceTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type TenantDeviceProjectLite = {
  id: string;
  name: string | null;
};

export type TenantDeviceCameraLite = {
  id: string;
  name: string | null;
};

export type PlatformTenantDeviceRow = TenantDeviceRow & {
  tenant: TenantDeviceTenantLite | null;
  source_project: TenantDeviceProjectLite | null;
  bound_project: TenantDeviceProjectLite | null;
  bound_camera: TenantDeviceCameraLite | null;
};

export type TenantDeviceFilterableQuery<T> = {
  eq(column: string, value: unknown): T;
  is(column: string, value: unknown): T;
  or(filters: string): T;
};

export type TenantDeviceRepositoryContext = {
  adminClient: ReturnType<typeof SupabaseDB.getAdminClient>;
};
