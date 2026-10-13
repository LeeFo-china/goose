import {
  saveCameraStatus,
  enrichTencentCameraStatuses,
  getCustomerOwnedProjectTenant,
  assertProjectExists,
  resolveActor,
  logAccess,
} from "./legacy/access";
import {
  listProjectCameras,
  listCameraBindProjectOptions,
  listCameraProjectGroups,
  listCameraWorkspaceDevices,
} from "./legacy/lists";
import {
  listEzvizDeviceChannels,
  listTencentDeviceChannels,
} from "./legacy/channels";
import {
  createTencentDevice,
  getTencentDevicePassword,
  resetTencentDevicePassword,
} from "./legacy/tencent-device";
import { getPlayParams } from "./legacy/playback";
import {
  createProjectCamera,
  updateProjectCamera,
  deleteProjectCamera,
} from "./legacy/mutations";

class ProjectCameraService {
  private saveCameraStatus = saveCameraStatus;
  private enrichTencentCameraStatuses = enrichTencentCameraStatuses;
  private getCustomerOwnedProjectTenant = getCustomerOwnedProjectTenant;
  private assertProjectExists = assertProjectExists;
  private resolveActor = resolveActor;
  private logAccess = logAccess;
  listProjectCameras = listProjectCameras;
  listCameraBindProjectOptions = listCameraBindProjectOptions;
  listCameraProjectGroups = listCameraProjectGroups;
  listCameraWorkspaceDevices(input: Parameters<typeof listCameraWorkspaceDevices>[0]) {
    return listCameraWorkspaceDevices.call({ resolveActor: this.resolveActor.bind(this) }, input);
  }
  listEzvizDeviceChannels = listEzvizDeviceChannels;
  listTencentDeviceChannels = listTencentDeviceChannels;
  createTencentDevice = createTencentDevice;
  getTencentDevicePassword = getTencentDevicePassword;
  resetTencentDevicePassword = resetTencentDevicePassword;
  getPlayParams = getPlayParams;
  createProjectCamera = createProjectCamera;
  updateProjectCamera = updateProjectCamera;
  deleteProjectCamera = deleteProjectCamera;
}

export const projectCameraService = new ProjectCameraService();
