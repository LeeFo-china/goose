import {
  createTenantDevice,
  deleteTenantDevice,
  getTenantDevice,
  updateTenantDevice,
} from "./legacy/crud";
import {
  listPlatformTenantDevices,
  listPlatformTencentDevices,
  listTenantDevices,
} from "./legacy/lists";
import {
  deletePlatformTencentDevice,
  getPlatformTencentDeviceAccessInfo,
  getPlatformTencentDevicePassword,
  resetPlatformTencentDevicePassword,
  syncPlatformTenantDevice,
} from "./legacy/platform-tencent";
import { syncTenantDevices } from "./legacy/sync";
import { getTenantTencentDeviceAccessInfo } from "./legacy/tenant-tencent";
import { createTenantTencentDevice } from "./legacy/tenant-tencent-create";
import { getTenantDevicePlayParams } from "./legacy/playback";

class TenantDeviceService {
  listTenantDevices = listTenantDevices;
  listPlatformTenantDevices = listPlatformTenantDevices;
  listPlatformTencentDevices = listPlatformTencentDevices;
  deletePlatformTencentDevice = deletePlatformTencentDevice;
  getTenantDevice = getTenantDevice;
  createTenantDevice = createTenantDevice;
  createTenantTencentDevice = createTenantTencentDevice;
  getTenantDevicePlayParams = getTenantDevicePlayParams;
  updateTenantDevice = updateTenantDevice;
  deleteTenantDevice = deleteTenantDevice;
  syncTenantDevices = syncTenantDevices;
  getTenantTencentDeviceAccessInfo = getTenantTencentDeviceAccessInfo;
  getPlatformTencentDeviceAccessInfo = getPlatformTencentDeviceAccessInfo;
  getPlatformTencentDevicePassword = getPlatformTencentDevicePassword;
  resetPlatformTencentDevicePassword = resetPlatformTencentDevicePassword;
  syncPlatformTenantDevice = syncPlatformTenantDevice;
}

export const tenantDeviceService = new TenantDeviceService();
