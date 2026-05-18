import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type { ProjectCameraRow } from "@/repositories/project-cameras";
import type { ProjectCameraVendor } from "@/schema/project-cameras";
import type {
  CreateTenantDeviceInput,
  PlatformTenantDeviceListQueryInput,
  TenantDeviceListQueryInput,
  TenantDeviceStatus,
  UpdateTenantDeviceInput,
} from "@/schema/tenant-devices";
import { SupabaseDB } from "@/utils/supabase";

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

class TenantDeviceRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async list(input: TenantDeviceListQueryInput & { tenantId?: string | null }) {
    const page = input.page;
    const pageSize = input.pageSize;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const keyword = input.keyword?.trim();

    let query = this.adminClient
      .from("tenant_devices")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }
    if (input.vendor) {
      query = query.eq("vendor", input.vendor);
    }
    if (input.status) {
      query = query.eq("status", input.status);
    }
    if (input.only_unbound) {
      query = query.is("bound_camera_id", null);
    }
    if (keyword) {
      const safeKeyword = keyword.replace(/[%,()]/g, " ").replace(/\s+/g, " ");
      query = query.or([
        `vendor_device_serial.ilike.%${safeKeyword}%`,
        `vendor_device_code.ilike.%${safeKeyword}%`,
        `vendor_device_name.ilike.%${safeKeyword}%`,
        `vendor_channel_id.ilike.%${safeKeyword}%`,
        `vendor_channel_code.ilike.%${safeKeyword}%`,
        `vendor_channel_name.ilike.%${safeKeyword}%`,
      ].join(","));
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

  async listPlatform(input: PlatformTenantDeviceListQueryInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.applyListFilters(
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
      list: await this.hydratePlatformRows(rows),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findById(id: string, tenantId?: string | null) {
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

  async findByVendorDeviceChannel(input: {
    vendor: ProjectCameraVendor;
    vendor_device_serial: string;
    vendor_channel_id?: string | null;
  }) {
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

  async listAllByTenant(tenantId: string) {
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

  async listActiveByVendor(vendor: ProjectCameraVendor) {
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

  async listActiveByVendorDeviceSerial(
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

  async hydratePlatformRows(rows: TenantDeviceRow[]) {
    const [tenantMap, projectMap, cameraMap] = await Promise.all([
      this.findTenants(rows.map((item) => item.tenant_id)),
      this.findProjects(rows.flatMap((item) => [
        item.source_project_id,
        item.bound_project_id,
      ])),
      this.findCameras(rows.map((item) => item.bound_camera_id)),
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

  async create(input: CreateTenantDeviceInput & {
    tenant_id: string;
    created_by?: string | null;
  }) {
    const { data, error } = await this.adminClient
      .from("tenant_devices")
      .insert({
        tenant_id: input.tenant_id,
        vendor: input.vendor,
        vendor_device_serial: input.vendor_device_serial,
        vendor_device_code: input.vendor_device_code || null,
        vendor_device_name: input.vendor_device_name || null,
        vendor_channel_id: input.vendor_channel_id || null,
        vendor_channel_code: input.vendor_channel_code || null,
        vendor_channel_name: input.vendor_channel_name || null,
        device_type: input.device_type || null,
        source_project_id: input.source_project_id,
        status: input.status,
        metadata: input.metadata || {},
        created_by: input.created_by || null,
        updated_by: input.created_by || null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建设备资产失败", error);
    }

    return data as TenantDeviceRow;
  }

  async upsertSynced(input: {
    tenant_id: string;
    vendor: ProjectCameraVendor;
    vendor_device_serial: string;
    vendor_device_code?: string | null;
    vendor_device_name?: string | null;
    vendor_channel_id?: string | null;
    vendor_channel_code?: string | null;
    vendor_channel_name?: string | null;
    device_type?: string | null;
    source_project_id?: string | null;
    status: TenantDeviceStatus;
    raw_status?: string | number | null;
    metadata?: Record<string, unknown>;
    updated_by?: string | null;
  }) {
    const existing = await this.findByVendorDeviceChannel({
      vendor: input.vendor,
      vendor_device_serial: input.vendor_device_serial,
      vendor_channel_id: input.vendor_channel_id,
    });
    const payload = {
      tenant_id: input.tenant_id,
      vendor: input.vendor,
      vendor_device_serial: input.vendor_device_serial,
      vendor_device_code: input.vendor_device_code || null,
      vendor_device_name: input.vendor_device_name || null,
      vendor_channel_id: input.vendor_channel_id || null,
      vendor_channel_code: input.vendor_channel_code || null,
      vendor_channel_name: input.vendor_channel_name || null,
      device_type: input.device_type || null,
      source_project_id: input.source_project_id || null,
      status: input.status,
      raw_status: input.raw_status == null ? null : String(input.raw_status),
      metadata: input.metadata || {},
      updated_by: input.updated_by || null,
      last_synced_at: new Date().toISOString(),
    };

    if (existing) {
      if (existing.tenant_id !== input.tenant_id) {
        throw Errors.business(
          409,
          "该设备已归属其他租户",
          ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
        );
      }

      const { data, error } = await this.adminClient
        .from("tenant_devices")
        .update({
          ...payload,
          bound_project_id: existing.bound_project_id,
          bound_camera_id: existing.bound_camera_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        throw Errors.dbError("同步设备资产失败", error);
      }

      return { device: data as TenantDeviceRow, created: false };
    }

    const { data, error } = await this.adminClient
      .from("tenant_devices")
      .insert({
        ...payload,
        created_by: input.updated_by || null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("同步设备资产失败", error);
    }

    return { device: data as TenantDeviceRow, created: true };
  }

  private applyListFilters(query: any, input: TenantDeviceListQueryInput) {
    const keyword = input.keyword?.trim();
    let request = query;

    if (input.vendor) {
      request = request.eq("vendor", input.vendor);
    }
    if (input.status) {
      request = request.eq("status", input.status);
    }
    if (input.only_unbound) {
      request = request.is("bound_camera_id", null);
    }
    if (keyword) {
      const safeKeyword = keyword.replace(/[%,()]/g, " ").replace(/\s+/g, " ");
      request = request.or([
        `vendor_device_serial.ilike.%${safeKeyword}%`,
        `vendor_device_code.ilike.%${safeKeyword}%`,
        `vendor_device_name.ilike.%${safeKeyword}%`,
        `vendor_channel_id.ilike.%${safeKeyword}%`,
        `vendor_channel_code.ilike.%${safeKeyword}%`,
        `vendor_channel_name.ilike.%${safeKeyword}%`,
      ].join(","));
    }

    return request;
  }

  private uniqueIds(ids: Array<string | null | undefined>) {
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  }

  private async findTenants(ids: Array<string | null | undefined>) {
    const uniqueIds = this.uniqueIds(ids);
    if (uniqueIds.length === 0) return new Map<string, TenantDeviceTenantLite>();

    const { data, error } = await this.adminClient
      .from("tenants")
      .select("id,name,slug,status")
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询设备资产租户失败", error);
    }

    return new Map((data || []).map((item) => [
      item.id,
      item as TenantDeviceTenantLite,
    ]));
  }

  private async findProjects(ids: Array<string | null | undefined>) {
    const uniqueIds = this.uniqueIds(ids);
    if (uniqueIds.length === 0) return new Map<string, TenantDeviceProjectLite>();

    const { data, error } = await this.adminClient
      .from("projects")
      .select("id,name")
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询设备资产项目失败", error);
    }

    return new Map((data || []).map((item) => [
      item.id,
      item as TenantDeviceProjectLite,
    ]));
  }

  private async findCameras(ids: Array<string | null | undefined>) {
    const uniqueIds = this.uniqueIds(ids);
    if (uniqueIds.length === 0) return new Map<string, TenantDeviceCameraLite>();

    const { data, error } = await this.adminClient
      .from("project_cameras")
      .select("id,name")
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询设备资产摄像头失败", error);
    }

    return new Map((data || []).map((item) => [
      item.id,
      item as TenantDeviceCameraLite,
    ]));
  }

  async upsertFromProjectCamera(camera: ProjectCameraRow, actorEmployeeId?: string | null) {
    const existing = await this.findByVendorDeviceChannel({
      vendor: camera.vendor,
      vendor_device_serial: camera.vendor_device_serial,
      vendor_channel_id: camera.vendor_channel_id,
    });

    const payload = {
      tenant_id: camera.tenant_id,
      vendor: camera.vendor,
      vendor_device_serial: camera.vendor_device_serial,
      vendor_device_code: camera.vendor_device_code,
      vendor_channel_id: camera.vendor_channel_id,
      vendor_channel_code: camera.vendor_channel_code,
      vendor_channel_name: camera.name,
      source_project_id: camera.project_id,
      bound_project_id: camera.project_id,
      bound_camera_id: camera.id,
      status: camera.status,
      metadata: {
        position: camera.position,
        channel_no: camera.channel_no,
        play_protocol: camera.play_protocol,
      },
      updated_by: actorEmployeeId || null,
      last_synced_at: camera.last_status_checked_at,
    };

    if (existing) {
      const { data, error } = await this.adminClient
        .from("tenant_devices")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        throw Errors.dbError("更新设备资产绑定失败", error);
      }

      return data as TenantDeviceRow;
    }

    const { data, error } = await this.adminClient
      .from("tenant_devices")
      .insert({
        ...payload,
        created_by: actorEmployeeId || null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建设备资产绑定失败", error);
    }

    return data as TenantDeviceRow;
  }

  async markUnboundByCameraId(cameraId: string, actorEmployeeId?: string | null) {
    const { error } = await this.adminClient
      .from("tenant_devices")
      .update({
        bound_project_id: null,
        bound_camera_id: null,
        updated_by: actorEmployeeId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("bound_camera_id", cameraId)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw Errors.dbError("更新设备资产解绑状态失败", error);
    }
  }

  async updateStatusByCameraId(input: {
    cameraId: string;
    status: TenantDeviceStatus;
    rawStatus?: string | null;
  }) {
    const { error } = await this.adminClient
      .from("tenant_devices")
      .update({
        status: input.status,
        raw_status: input.rawStatus || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("bound_camera_id", input.cameraId)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw Errors.dbError("更新设备资产状态失败", error);
    }
  }

  async update(
    id: string,
    input: UpdateTenantDeviceInput & { updated_by?: string | null },
    tenantId?: string | null,
  ) {
    const { updated_by, ...payload } = input;
    let query = this.adminClient
      .from("tenant_devices")
      .update({
        ...payload,
        updated_by: updated_by || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新设备资产失败", error);
    }

    if (!data) {
      throw Errors.badRequest("设备资产不存在或更新失败");
    }

    return data as TenantDeviceRow;
  }

  async softDelete(id: string, tenantId?: string | null, actorEmployeeId?: string | null) {
    let query = this.adminClient
      .from("tenant_devices")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorEmployeeId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("删除设备资产失败", error);
    }

    if (!data) {
      throw Errors.badRequest("设备资产不存在或删除失败");
    }

    return data as { id: string };
  }
}

export const tenantDeviceRepository = new TenantDeviceRepository();
