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
  listCameraProjectGroups = listCameraProjectGroups;
  findByProjectCamera = findByProjectCamera;
  findActiveByDeviceChannel = findActiveByDeviceChannel;
  listActiveBindingsByVendor = listActiveBindingsByVendor;
  listActiveBindingsByVendorDeviceSerial = listActiveBindingsByVendorDeviceSerial;
  create = create;
  update = update;
  updateStatus = updateStatus;
  softDelete = softDelete;
  logAccess = logAccess;
}

export const projectCameraRepository = new ProjectCameraRepository();
