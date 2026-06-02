import { uniqueIds } from "./filters";
import {
  Errors,
  type PlatformTenantDeviceRow,
  type TenantDeviceCameraLite,
  type TenantDeviceProjectLite,
  type TenantDeviceRepositoryContext,
  type TenantDeviceRow,
  type TenantDeviceTenantLite,
} from "./shared";

export async function hydratePlatformRows(
  this: TenantDeviceRepositoryContext,
  rows: TenantDeviceRow[],
) {
  const [tenantMap, projectMap, cameraMap] = await Promise.all([
    findTenants.call(this, rows.map((item) => item.tenant_id)),
    findProjects.call(this, rows.flatMap((item) => [
      item.source_project_id,
      item.bound_project_id,
    ])),
    findCameras.call(this, rows.map((item) => item.bound_camera_id)),
  ]);

  return rows.map((item): PlatformTenantDeviceRow => ({
    ...item,
    tenant: tenantMap.get(item.tenant_id) ?? null,
    source_project: item.source_project_id
      ? projectMap.get(item.source_project_id) ?? null
      : null,
    bound_project: item.bound_project_id
      ? projectMap.get(item.bound_project_id) ?? null
      : null,
    bound_camera: item.bound_camera_id
      ? cameraMap.get(item.bound_camera_id) ?? null
      : null,
  }));
}

async function findTenants(
  this: TenantDeviceRepositoryContext,
  ids: Array<string | null | undefined>,
) {
  const idsToFetch = uniqueIds(ids);
  if (idsToFetch.length === 0) return new Map<string, TenantDeviceTenantLite>();

  const { data, error } = await this.adminClient
    .from("tenants")
    .select("id,name,slug,status")
    .in("id", idsToFetch);

  if (error) {
    throw Errors.dbError("查询设备资产租户失败", error);
  }

  return new Map((data || []).map((item) => [
    item.id,
    item as TenantDeviceTenantLite,
  ]));
}

async function findProjects(
  this: TenantDeviceRepositoryContext,
  ids: Array<string | null | undefined>,
) {
  const idsToFetch = uniqueIds(ids);
  if (idsToFetch.length === 0) return new Map<string, TenantDeviceProjectLite>();

  const { data, error } = await this.adminClient
    .from("projects")
    .select("id,name")
    .in("id", idsToFetch);

  if (error) {
    throw Errors.dbError("查询设备资产项目失败", error);
  }

  return new Map((data || []).map((item) => [
    item.id,
    item as TenantDeviceProjectLite,
  ]));
}

async function findCameras(
  this: TenantDeviceRepositoryContext,
  ids: Array<string | null | undefined>,
) {
  const idsToFetch = uniqueIds(ids);
  if (idsToFetch.length === 0) return new Map<string, TenantDeviceCameraLite>();

  const { data, error } = await this.adminClient
    .from("project_cameras")
    .select("id,name")
    .in("id", idsToFetch);

  if (error) {
    throw Errors.dbError("查询设备资产摄像头失败", error);
  }

  return new Map((data || []).map((item) => [
    item.id,
    item as TenantDeviceCameraLite,
  ]));
}
