import {
  markUnboundByCameraId,
  updateStatusByCameraId,
  upsertFromProjectCamera,
} from "./legacy/camera-sync";
import { hydratePlatformRows } from "./legacy/hydrate";
import {
  create,
  softDelete,
  update,
  upsertSynced,
} from "./legacy/mutations";
import {
  findById,
  findByVendorDeviceChannel,
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
  TenantDeviceTenantLite,
} from "./legacy/shared";

class TenantDeviceRepository {
  adminClient = SupabaseDB.getAdminClient();

  list = list;
  listPlatform = listPlatform;
  findById = findById;
  findByVendorDeviceChannel = findByVendorDeviceChannel;
  listAllByTenant = listAllByTenant;
  listActiveByVendor = listActiveByVendor;
  listActiveByVendorDeviceSerial = listActiveByVendorDeviceSerial;
  hydratePlatformRows = hydratePlatformRows;
  create = create;
  upsertSynced = upsertSynced;
  upsertFromProjectCamera = upsertFromProjectCamera;
  markUnboundByCameraId = markUnboundByCameraId;
  updateStatusByCameraId = updateStatusByCameraId;
  update = update;
  softDelete = softDelete;
}

export const tenantDeviceRepository = new TenantDeviceRepository();
