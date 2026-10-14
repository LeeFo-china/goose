import { bindProjectCamera, unbindProjectCamera } from "./binding";
import { saveWorkspaceStatuses, type SaveWorkspaceStatusesInput } from "./workspace-status";
import {
  listCameraWorkspaceDevices,
  type CameraWorkspaceDevicesInput,
  type CameraWorkspaceProjectsInput,
} from "./workspace";
import { SupabaseDB } from "./legacy/shared";
import { getCustomerOwnedProjectTenant, getProject } from "./legacy/access";
import {
  findSearchCustomerIds,
  findSearchPropertyIds,
  listCameraBindProjectOptions,
  listCameraProjectGroups,
} from "./legacy/bind-options";
import {
  listByProjectId,
  findByProjectCamera,
  findActiveByDeviceChannel,
  listActiveBindingsByVendor,
  listActiveBindingsByVendorDeviceSerial,
} from "./legacy/queries";
import { create, update, updateStatus, softDelete, logAccess } from "./legacy/mutations";

export type {
  CameraAccessLogAction,
  CustomerOwnedProjectTenantRow,
  ProjectCameraBindingRow,
  ProjectCameraProjectGroupRow,
  ProjectCameraRow,
} from "./legacy/shared";

class ProjectCameraRepository {
  private adminClient = SupabaseDB.getAdminClient();

  getCustomerOwnedProjectTenant = getCustomerOwnedProjectTenant;
  getProject = getProject;
  listByProjectId = listByProjectId;
  private findSearchCustomerIds = findSearchCustomerIds;
  private findSearchPropertyIds = findSearchPropertyIds;
  listCameraBindProjectOptions = listCameraBindProjectOptions;
  listCameraProjectGroups(input: CameraWorkspaceProjectsInput) {
    return listCameraProjectGroups.call({ adminClient: this.adminClient }, input);
  }
  listCameraWorkspaceDevices(input: CameraWorkspaceDevicesInput) {
    return listCameraWorkspaceDevices(this.adminClient, input);
  }
  saveWorkspaceStatuses(input: SaveWorkspaceStatusesInput) {
    return saveWorkspaceStatuses(this.adminClient, input);
  }
  findByProjectCamera = findByProjectCamera;
  findActiveByDeviceChannel = findActiveByDeviceChannel;
  listActiveBindingsByVendor = listActiveBindingsByVendor;
  listActiveBindingsByVendorDeviceSerial = listActiveBindingsByVendorDeviceSerial;
  bindProjectCamera(input: Parameters<typeof bindProjectCamera>[1]) {
    return bindProjectCamera(this.adminClient, input);
  }
  unbindProjectCamera(input: Parameters<typeof unbindProjectCamera>[1]) {
    return unbindProjectCamera(this.adminClient, input);
  }
  create = create;
  update = update;
  updateStatus = updateStatus;
  softDelete = softDelete;
  logAccess = logAccess;
}

export const projectCameraRepository = new ProjectCameraRepository();
