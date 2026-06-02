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

class TenantDeviceService {
  listTenantDevices = listTenantDevices;
  listPlatformTenantDevices = listPlatformTenantDevices;
  listPlatformTencentDevices = listPlatformTencentDevices;
  deletePlatformTencentDevice = deletePlatformTencentDevice;
  getTenantDevice = getTenantDevice;
  createTenantDevice = createTenantDevice;
  updateTenantDevice = updateTenantDevice;
  deleteTenantDevice = deleteTenantDevice;
  syncTenantDevices = syncTenantDevices;
  getPlatformTencentDeviceAccessInfo = getPlatformTencentDeviceAccessInfo;
  getPlatformTencentDevicePassword = getPlatformTencentDevicePassword;
  resetPlatformTencentDevicePassword = resetPlatformTencentDevicePassword;
  syncPlatformTenantDevice = syncPlatformTenantDevice;
}

export const tenantDeviceService = new TenantDeviceService();
