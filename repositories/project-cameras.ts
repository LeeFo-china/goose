import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateProjectCameraInput,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

export type ProjectCameraRow = {
  id: string;
  project_id: string;
  vendor: "ezviz";
  vendor_device_serial: string;
  channel_no: number;
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
    vendor: "ezviz";
    vendor_device_serial: string;
    channel_no: number;
  }) {
    const { data, error } = await this.adminClient
      .from("project_cameras")
      .select("*")
      .eq("vendor", input.vendor)
      .eq("vendor_device_serial", input.vendor_device_serial)
      .eq("channel_no", input.channel_no)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询摄像头绑定状态失败", error);
    }

    return (data || null) as ProjectCameraRow | null;
  }

  async create(projectId: string, input: CreateProjectCameraInput) {
    const existing = await this.findActiveByDeviceChannel({
      vendor: input.vendor,
      vendor_device_serial: input.vendor_device_serial,
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
