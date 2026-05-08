import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateProjectCameraInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraVendor,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

export type ProjectCameraRow = {
  id: string;
  project_id: string;
  vendor: ProjectCameraVendor;
  vendor_device_serial: string;
  vendor_channel_id: string | null;
  vendor_device_code: string | null;
  vendor_channel_code: string | null;
  channel_no: number;
  play_protocol: "flv" | "rtmp" | "hls";
  name: string;
  position: string | null;
  status: "online" | "offline" | "unknown";
  can_view: boolean;
  can_control: boolean;
  capabilities: unknown;
  cover_url: string | null;
  sort_order: number;
  remark: string | null;
  video_encrypted: boolean;
  last_status_checked_at: string | null;
  last_status_error: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CameraAccessLogAction = "list" | "play_params" | "refresh_status" | "control";

export type ProjectCameraBindingRow = Pick<
  ProjectCameraRow,
  | "id"
  | "project_id"
  | "vendor"
  | "vendor_device_serial"
  | "vendor_channel_id"
  | "vendor_device_code"
  | "vendor_channel_code"
  | "channel_no"
  | "name"
> & {
  project?: {
    id?: string | null;
    name?: string | null;
  } | Array<{
    id?: string | null;
    name?: string | null;
  }> | null;
};

type ProjectCameraBindProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  customer_id: string | null;
  property_id: string | null;
  customer?: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
  } | Array<{
    id?: string | null;
    name?: string | null;
    phone?: string | null;
  }> | null;
  property?: {
    id?: string | null;
    community?: string | null;
    building_info?: string | null;
    layout?: string | null;
    area?: number | null;
  } | Array<{
    id?: string | null;
    community?: string | null;
    building_info?: string | null;
    layout?: string | null;
    area?: number | null;
  }> | null;
};

export type ProjectCameraProjectGroupRow = {
  project: ReturnType<typeof serializeBindProjectOption>;
  cameras: ProjectCameraRow[];
};

type ProjectCameraWithProjectRow = ProjectCameraRow & {
  project?: ProjectCameraBindProjectRow | ProjectCameraBindProjectRow[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function cleanSearchKeyword(value: string | null | undefined) {
  return (value || "")
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

function maskPhone(phone: string | null | undefined) {
  const normalized = (phone || "").trim();
  if (!normalized) return null;
  if (normalized.length <= 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function buildPropertyAddress(row: ProjectCameraBindProjectRow) {
  const property = firstRelation(row.property);
  return [
    property?.community,
    property?.building_info,
  ].filter(Boolean).join(" ") || row.address || null;
}

function serializeBindProjectOption(row: ProjectCameraBindProjectRow) {
  const customer = firstRelation(row.customer);
  const property = firstRelation(row.property);
  const address = buildPropertyAddress(row);
  const name = row.name || address || "未命名项目";
  const customerName = customer?.name || null;

  return {
    id: row.id,
    label: [address || name, customerName].filter(Boolean).join(" · "),
    name,
    status: row.status || null,
    customer_name: customerName,
    phone_masked: maskPhone(customer?.phone),
    address,
    property: property
      ? {
        id: property.id || null,
        community: property.community || null,
        building_info: property.building_info || null,
        layout: property.layout || null,
        area: property.area ?? null,
      }
      : null,
  };
}

class ProjectCameraRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async listByProjectId(projectId: string) {
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询项目摄像头失败", error);
    }

    return (data || []) as ProjectCameraRow[];
  }

  private async findSearchCustomerIds(keyword: string) {
    if (!keyword) return [] as string[];

    const likeKeyword = `%${keyword}%`;
    const { data, error } = await this.adminClient
      .from("customers")
      .select("id")
      .or(`name.ilike.${likeKeyword},phone.ilike.${likeKeyword}`)
      .limit(100);

    if (error) {
      throw Errors.dbError("查询客户匹配项目失败", error);
    }

    return (data || [])
      .map((item) => (item as { id?: string | null }).id)
      .filter((id): id is string => Boolean(id));
  }

  private async findSearchPropertyIds(keyword: string) {
    if (!keyword) return [] as string[];

    const likeKeyword = `%${keyword}%`;
    const { data, error } = await this.adminClient
      .from("properties")
      .select("id")
      .or(`community.ilike.${likeKeyword},building_info.ilike.${likeKeyword},layout.ilike.${likeKeyword}`)
      .limit(100);

    if (error) {
      throw Errors.dbError("查询房产匹配项目失败", error);
    }

    return (data || [])
      .map((item) => (item as { id?: string | null }).id)
      .filter((id): id is string => Boolean(id));
  }

  async listCameraBindProjectOptions(
    input: ProjectCameraBindOptionsQueryInput & {
      visibleProjectIds: string[] | null;
    },
  ) {
    const page = input.page;
    const pageSize = input.pageSize;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const keyword = cleanSearchKeyword(input.keyword);

    if (Array.isArray(input.visibleProjectIds) && input.visibleProjectIds.length === 0) {
      return {
        list: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const [customerIds, propertyIds] = await Promise.all([
      this.findSearchCustomerIds(keyword),
      this.findSearchPropertyIds(keyword),
    ]);

    let query = this.adminClient
      .from("projects")
      .select(
        `
        id,
        name,
        status,
        address,
        customer_id,
        property_id,
        customer:customers!projects_customer_id_fkey(id, name, phone),
        property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
        `,
        { count: "exact" },
      );

    if (input.visibleProjectIds) {
      query = query.in("id", input.visibleProjectIds);
    }

    if (keyword) {
      const likeKeyword = `%${keyword}%`;
      const filters = [
        `name.ilike.${likeKeyword}`,
        `address.ilike.${likeKeyword}`,
      ];
      if (customerIds.length) {
        filters.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      if (propertyIds.length) {
        filters.push(`property_id.in.(${propertyIds.join(",")})`);
      }
      query = query.or(filters.join(","));
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询绑定项目选项失败", error);
    }

    const rows = ((data || []) as ProjectCameraBindProjectRow[]).map(
      serializeBindProjectOption,
    );
    const selectedProjectId = input.selected_project_id;
    if (
      selectedProjectId &&
      !rows.some((item) => item.id === selectedProjectId) &&
      (!input.visibleProjectIds || input.visibleProjectIds.includes(selectedProjectId))
    ) {
      const { data: selected, error: selectedError } = await this.adminClient
        .from("projects")
        .select(`
          id,
          name,
          status,
          address,
          customer_id,
          property_id,
          customer:customers!projects_customer_id_fkey(id, name, phone),
          property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
        `)
        .eq("id", selectedProjectId)
        .maybeSingle();

      if (selectedError) {
        throw Errors.dbError("查询当前绑定项目失败", selectedError);
      }

      if (selected) {
        rows.unshift(serializeBindProjectOption(selected as ProjectCameraBindProjectRow));
      }
    }

    return {
      list: rows,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async listCameraProjectGroups(
    input: ProjectCameraProjectGroupsQueryInput & {
      visibleProjectIds: string[] | null;
    },
  ) {
    const page = input.page;
    const pageSize = input.pageSize;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const keyword = cleanSearchKeyword(input.keyword).toLowerCase();

    if (Array.isArray(input.visibleProjectIds) && input.visibleProjectIds.length === 0) {
      return {
        list: [] as ProjectCameraProjectGroupRow[],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
        summary: {
          project_count: 0,
          total_camera_count: 0,
          online_count: 0,
          hidden_count: 0,
          tencent_count: 0,
        },
      };
    }

    let query = this.adminClient
      .from("project_cameras")
      .select(`
        *,
        project:projects!project_cameras_project_id_fkey(
          id,
          name,
          status,
          address,
          customer_id,
          property_id,
          customer:customers!projects_customer_id_fkey(id, name, phone),
          property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
        )
      `)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (input.visibleProjectIds) {
      query = query.in("project_id", input.visibleProjectIds);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询项目摄像头分组失败", error);
    }

    const groupMap = new Map<string, ProjectCameraProjectGroupRow>();

    for (const row of (data || []) as ProjectCameraWithProjectRow[]) {
      const project = firstRelation(row.project);
      if (!project?.id) continue;

      const projectOption = serializeBindProjectOption(project);
      const searchable = [
        projectOption.label,
        projectOption.name,
        projectOption.customer_name,
        projectOption.phone_masked,
        projectOption.address,
        projectOption.property?.community,
        projectOption.property?.building_info,
        projectOption.property?.layout,
      ].filter(Boolean).join(" ").toLowerCase();

      if (keyword && !searchable.includes(keyword)) continue;

      const existing = groupMap.get(project.id);
      if (existing) {
        existing.cameras.push(row);
      } else {
        groupMap.set(project.id, {
          project: projectOption,
          cameras: [row],
        });
      }
    }

    const groups = Array.from(groupMap.values());
    const allCameras = groups.flatMap((group) => group.cameras);
    const pageGroups = groups.slice(from, to);

    return {
      list: pageGroups,
      pagination: {
        page,
        pageSize,
        total: groups.length,
        totalPages: groups.length ? Math.ceil(groups.length / pageSize) : 0,
      },
      summary: {
        project_count: groups.length,
        total_camera_count: allCameras.length,
        online_count: allCameras.filter((camera) => camera.status === "online").length,
        hidden_count: allCameras.filter((camera) => !camera.can_view).length,
        tencent_count: allCameras.filter((camera) =>
          camera.vendor === "tencent_iotvideo_industry"
        ).length,
      },
    };
  }

  async findByProjectCamera(projectId: string, cameraId: string) {
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", cameraId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目摄像头失败", error);
    }

    return (data || null) as ProjectCameraRow | null;
  }

  async findActiveByDeviceChannel(input: {
    vendor: ProjectCameraVendor;
    vendor_device_serial: string;
    vendor_channel_id?: string | null;
    channel_no: number;
  }) {
    let query = this.adminClient
      .from("project_cameras")
      .select("*")
      .eq("vendor", input.vendor)
      .eq("vendor_device_serial", input.vendor_device_serial)
      .is("deleted_at", null);

    if (input.vendor === "tencent_iotvideo_industry") {
      query = query.eq("vendor_channel_id", input.vendor_channel_id || "");
    } else {
      query = query.eq("channel_no", input.channel_no);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询摄像头绑定状态失败", error);
    }

    return (data || null) as ProjectCameraRow | null;
  }

  async listActiveBindingsByVendor(vendor: ProjectCameraVendor) {
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .select(`
        id,
        project_id,
        vendor,
        vendor_device_serial,
        vendor_channel_id,
        vendor_device_code,
        vendor_channel_code,
        channel_no,
        name,
        project:projects(id, name)
      `)
      .eq("vendor", vendor)
      .is("deleted_at", null);

    if (error) {
      throw Errors.dbError("查询摄像头绑定状态失败", error);
    }

    return (data || []) as ProjectCameraBindingRow[];
  }

  async create(projectId: string, input: CreateProjectCameraInput) {
    const existing = await this.findActiveByDeviceChannel({
      vendor: input.vendor,
      vendor_device_serial: input.vendor_device_serial,
      vendor_channel_id: input.vendor_channel_id,
      channel_no: input.channel_no,
    });

    if (existing?.project_id === projectId) {
      throw Errors.business(
        409,
        "该摄像头已绑定到当前项目",
        ErrorCodes.CAMERA_ALREADY_BOUND,
      );
    }

    if (existing) {
      throw Errors.business(
        409,
        "该摄像头已绑定到其他项目，请先解绑后再绑定",
        ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
      );
    }

    const { data, error } = await this.adminClient
      .from("project_cameras")
      .insert({
        project_id: projectId,
        ...input,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("绑定项目摄像头失败", error);
    }

    return data as ProjectCameraRow;
  }

  async update(projectId: string, cameraId: string, input: UpdateProjectCameraInput) {
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("id", cameraId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目摄像头失败", error);
    }

    if (!data) {
      throw Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND);
    }

    return data as ProjectCameraRow;
  }

  async updateStatus(input: {
    cameraId: string;
    status: ProjectCameraRow["status"];
    errorMessage?: string | null;
  }) {
    const { error } = await this.adminClient
      .from("project_cameras")
      .update({
        status: input.status,
        last_status_checked_at: new Date().toISOString(),
        last_status_error: input.errorMessage || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.cameraId)
      .is("deleted_at", null);

    if (error) {
      throw Errors.dbError("更新摄像头状态失败", error);
    }
  }

  async softDelete(projectId: string, cameraId: string) {
    const now = new Date().toISOString();
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .update({
        deleted_at: now,
        updated_at: now,
      })
      .eq("project_id", projectId)
      .eq("id", cameraId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("删除项目摄像头失败", error);
    }

    if (!data) {
      throw Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND);
    }

    return data as { id: string };
  }

  async logAccess(input: {
    project_id: string;
    camera_id?: string | null;
    user_id?: string | null;
    user_role?: string | null;
    action: CameraAccessLogAction;
    control_action?: string | null;
    result?: "success" | "failure";
    error_message?: string | null;
    ip?: string | null;
    user_agent?: string | null;
  }) {
    const { error } = await this.adminClient
      .from("camera_access_logs")
      .insert({
        project_id: input.project_id,
        camera_id: input.camera_id || "00000000-0000-0000-0000-000000000000",
        user_id: input.user_id || null,
        user_role: input.user_role || null,
        action: input.action,
        control_action: input.control_action || null,
        result: input.result || "success",
        error_message: input.error_message || null,
        ip: input.ip || null,
        user_agent: input.user_agent || null,
      });

    if (error) {
      throw Errors.dbError("记录摄像头访问日志失败", error);
    }
  }
}

export const projectCameraRepository = new ProjectCameraRepository();
