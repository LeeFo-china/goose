import { applyListFilters } from "./filters";
import { hydratePlatformRows } from "./hydrate";
import {
  Errors,
  type PlatformTenantDeviceListQueryInput,
  type ProjectCameraVendor,
  type TenantDeviceListQueryInput,
  type TenantDeviceRepositoryContext,
  type TenantDeviceRow,
} from "./shared";

export async function list(
  this: TenantDeviceRepositoryContext,
  input: TenantDeviceListQueryInput & { tenantId?: string | null },
) {
  const page = input.page;
  const pageSize = input.pageSize;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = applyListFilters(
    this.adminClient
      .from("tenant_devices")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    input,
  );

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw Errors.dbError("查询租户设备资产失败", error);
  }

  return {
    list: (data || []) as TenantDeviceRow[],
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export async function listPlatform(
  this: TenantDeviceRepositoryContext,
  input: PlatformTenantDeviceListQueryInput,
) {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  let query = applyListFilters(
    this.adminClient
      .from("tenant_devices")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    input,
  );

  if (input.tenant_id) {
    query = query.eq("tenant_id", input.tenant_id);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw Errors.dbError("查询平台设备资产失败", error);
  }

  const rows = (data || []) as TenantDeviceRow[];

  return {
    list: await hydratePlatformRows.call(this, rows),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / input.pageSize) : 0,
    },
  };
}

export async function findById(
  this: TenantDeviceRepositoryContext,
  id: string,
  tenantId?: string | null,
) {
  let query = this.adminClient
    .from("tenant_devices")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw Errors.dbError("查询租户设备资产失败", error);
  }

  return (data || null) as TenantDeviceRow | null;
}

export async function findByVendorDeviceChannel(
  this: TenantDeviceRepositoryContext,
  input: {
    vendor: ProjectCameraVendor;
    vendor_device_serial: string;
    vendor_channel_id?: string | null;
  },
) {
  let query = this.adminClient
    .from("tenant_devices")
    .select("*")
    .eq("vendor", input.vendor)
    .eq("vendor_device_serial", input.vendor_device_serial)
    .is("deleted_at", null);

  if (input.vendor === "tencent_iotvideo_industry" && input.vendor_channel_id) {
    query = query.eq("vendor_channel_id", input.vendor_channel_id || "");
  } else if (input.vendor_channel_id) {
    query = query.eq("vendor_channel_id", input.vendor_channel_id);
  } else {
    query = query.is("vendor_channel_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw Errors.dbError("查询设备资产归属失败", error);
  }

  return (data || null) as TenantDeviceRow | null;
}

export async function listAllByTenant(
  this: TenantDeviceRepositoryContext,
  tenantId: string,
) {
  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .range(0, 999);

  if (error) {
    throw Errors.dbError("查询租户设备资产失败", error);
  }

  return (data || []) as TenantDeviceRow[];
}

export async function listActiveByVendor(
  this: TenantDeviceRepositoryContext,
  vendor: ProjectCameraVendor,
) {
  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .select("*")
    .eq("vendor", vendor)
    .is("deleted_at", null)
    .range(0, 9999);

  if (error) {
    throw Errors.dbError("查询设备资产归属失败", error);
  }

  return (data || []) as TenantDeviceRow[];
}

export async function listActiveByVendorDeviceSerial(
  this: TenantDeviceRepositoryContext,
  vendor: ProjectCameraVendor,
  vendorDeviceSerial: string,
) {
  const { data, error } = await this.adminClient
    .from("tenant_devices")
    .select("*")
    .eq("vendor", vendor)
    .eq("vendor_device_serial", vendorDeviceSerial)
    .is("deleted_at", null)
    .range(0, 999);

  if (error) {
    throw Errors.dbError("查询设备资产归属失败", error);
  }

  return (data || []) as TenantDeviceRow[];
}
