import { Errors } from "@/errors/error-factory";
import type { SupabaseDB } from "@/utils/supabase";
import type {
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraWorkspaceDevicesQueryInput,
} from "@/schema/project-cameras";
import {
  serializeBindProjectOption,
  type ProjectCameraBindProjectRow,
  type ProjectCameraProjectGroupRow,
  type ProjectCameraSummary,
  type ProjectCameraWorkspaceSummary,
  type ProjectCameraRow,
} from "./legacy/shared";

type AdminClient = ReturnType<typeof SupabaseDB.getAdminClient>;
export type CameraWorkspaceProjectsInput = ProjectCameraProjectGroupsQueryInput & {
  tenantId: string;
  visibleProjectIds: string[] | null;
};
type WorkspaceRpcResult = {
  list: Array<{ project: ProjectCameraBindProjectRow; summary: ProjectCameraSummary }>;
  total: number;
  summary: ProjectCameraWorkspaceSummary;
};
// A narrow database boundary also allows repository tests without a live client.
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown; error: unknown;
  }>;
};

export async function listCameraProjectGroups(
  this: { adminClient: RpcClient }, input: CameraWorkspaceProjectsInput,
) {
  const { page, pageSize } = input;
  if (!input.tenantId) throw Errors.forbidden();
  if (input.visibleProjectIds?.length === 0) {
    return {
      list: [] as ProjectCameraProjectGroupRow[],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      summary: { project_count: 0, total_camera_count: 0, online_count: 0,
        offline_count: 0, unknown_count: 0, hidden_count: 0, tencent_count: 0 },
    };
  }

  const { data, error } = await this.adminClient.rpc("list_camera_workspace_projects", {
    p_tenant_id: input.tenantId,
    p_visible_project_ids: input.visibleProjectIds,
    p_keyword: input.keyword || null,
    p_binding: input.binding,
    p_project_status: input.project_status || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error || !data) throw Errors.dbError("查询项目摄像头分组失败", error);
  // JSON shape is owned by the versioned RPC migration and covered by SQL tests.
  const result = data as WorkspaceRpcResult;
  const list: ProjectCameraProjectGroupRow[] = result.list.map((group) => ({
    project: serializeBindProjectOption(group.project),
    cameras: [],
    summary: group.summary,
  }));
  return {
    list,
    pagination: { page, pageSize, total: result.total,
      totalPages: Math.ceil(result.total / pageSize) },
    summary: result.summary,
  };
}

export type CameraWorkspaceDevicesInput = ProjectCameraWorkspaceDevicesQueryInput & {
  tenantId: string;
  projectId: string;
};
export type CameraWorkspaceDeviceRow = Pick<ProjectCameraRow,
  "id" | "vendor" | "name" | "position" | "status" | "can_view" | "can_control" |
  "capabilities" | "cover_url" | "sort_order" | "video_encrypted" | "play_protocol"
>;

export type CameraWorkspaceStatusRow = CameraWorkspaceDeviceRow & Pick<ProjectCameraRow,
  "vendor_device_serial" | "vendor_channel_id" | "last_status_checked_at" | "last_status_error"
>;

export async function listCameraWorkspaceDevices(
  client: AdminClient, input: CameraWorkspaceDevicesInput,
) {
  if (!input.tenantId) throw Errors.forbidden();
  const { page, pageSize } = input;
  const from = (page - 1) * pageSize;
  const { data, error, count } = await client.from("project_cameras")
    .select("id,vendor,name,position,status,can_view,can_control,capabilities,cover_url,sort_order,video_encrypted,play_protocol,vendor_device_serial,vendor_channel_id,last_status_checked_at,last_status_error", { count: "exact" })
    .eq("tenant_id", input.tenantId)
    .eq("project_id", input.projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw Errors.dbError("查询项目摄像头明细失败", error);
  const total = count || 0;
  return {
    list: (data || []) as CameraWorkspaceStatusRow[],
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
