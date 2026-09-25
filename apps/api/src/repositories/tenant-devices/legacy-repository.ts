import {
  markUnboundByCameraId,
  updateStatusByCameraId,
  upsertFromProjectCamera,
} from "./legacy/camera-sync";
import { hydratePlatformRows, hydrateTenantRows } from "./legacy/hydrate";
import {
  create,
  softDelete,
  update,
  updateHardwareSerialByDevice,
  upsertSynced,
} from "./legacy/mutations";
import {
  findById,
  findByVendorDeviceChannel,
  findByHardwareSerial,
  list,
  listActiveByVendor,
  listActiveByVendorDeviceSerial,
  listAllByTenant,
  listPlatform,
} from "./legacy/queries";
import { SupabaseDB } from "./legacy/shared";
export type {
  PlatformTenantDeviceRow,
  TenantDeviceCameraLite,
  TenantDeviceProjectLite,
  TenantDeviceRow,
  TenantDeviceHydratedRow,
  TenantDeviceTenantLite,
} from "./legacy/shared";

class TenantDeviceRepository {
  adminClient = SupabaseDB.getAdminClient();

  list = list;
  listPlatform = listPlatform;
  findById = findById;
  findByVendorDeviceChannel = findByVendorDeviceChannel;
  findByHardwareSerial = findByHardwareSerial;
  listAllByTenant = listAllByTenant;
  listActiveByVendor = listActiveByVendor;
  listActiveByVendorDeviceSerial = listActiveByVendorDeviceSerial;
  hydratePlatformRows = hydratePlatformRows;
  hydrateTenantRows = hydrateTenantRows;
  create = create;
  upsertSynced = upsertSynced;
  upsertFromProjectCamera = upsertFromProjectCamera;
  markUnboundByCameraId = markUnboundByCameraId;
  updateStatusByCameraId = updateStatusByCameraId;
  update = update;
  updateHardwareSerialByDevice = updateHardwareSerialByDevice;
  softDelete = softDelete;
}

export const tenantDeviceRepository = new TenantDeviceRepository();
