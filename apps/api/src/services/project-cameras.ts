import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService, type AuthContext } from "@/services/authorization";
import {
  buildEzvizLiveUrl,
  ezvizDeviceService,
  ezvizTokenService,
  getEzplayerPluginVersion,
} from "@/services/ezviz";
import {
  projectCameraRepository,
  type CameraAccessLogAction,
  type ProjectCameraRow,
} from "@/repositories/project-cameras";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateProjectCameraInput,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

type CameraActor = {
  userId: string;
  userRole: "customer" | "employee";
  authContext?: AuthContext;
};

type RequestLogMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

function normalizeCapabilities(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeCamera(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    name: camera.name,
    position: camera.position,
    status: camera.status,
    can_view: camera.can_view,
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
    cover_url: camera.cover_url,
    sort_order: camera.sort_order,
    video_encrypted: camera.video_encrypted,
  };
}

function serializeCameraForPlayer(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    name: camera.name,
    status: camera.status,
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
  };
}

function buildDeviceChannelKey(deviceSerial: string, channelNo: number) {
  return `${deviceSerial}:${channelNo}`;
}

function getBindingProject(project: unknown) {
  if (Array.isArray(project)) {
    return project[0] as { id?: string | null; name?: string | null } | undefined;
  }

  if (project && typeof project === "object") {
    return project as { id?: string | null; name?: string | null };
  }

  return undefined;
}

function getUserAgent(meta?: RequestLogMeta) {
  return meta?.userAgent || null;
}

function getIp(meta?: RequestLogMeta) {
  return meta?.ip || null;
}

class ProjectCameraService {
  private adminClient = SupabaseDB.getAdminClient();

  private async isCustomerOwnedProject(authUserId: string, projectId: string) {
    const { data: customers, error: customerError } = await this.adminClient
      .from("customers")
      .select("id")
      .eq("user_id", authUserId)
      .limit(1);

    if (customerError) {
      throw Errors.dbError("查询客户项目权限失败", customerError);
    }

    const customer = (customers || [])[0] as { id?: string } | undefined;
    if (!customer?.id) {
      return false;
    }

    const { data: project, error: projectError } = await this.adminClient
      .from("projects")
      .select("id, status")
      .eq("id", projectId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (projectError) {
      throw Errors.dbError("查询客户项目权限失败", projectError);
    }

    const status = (project as { status?: string } | null)?.status;
    return Boolean(project && status !== "completed" && status !== "invalid");
  }

  private async assertProjectExists(projectId: string) {
    const { data, error } = await this.adminClient
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    if (!data) {
      throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
    }
  }

  private async resolveActor(input: {
    authUserId?: string | null;
    projectId: string;
    permissionCode: "project.read" | "project.update";
    allowCustomer: boolean;
  }): Promise<CameraActor> {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    if (
      input.allowCustomer &&
      await this.isCustomerOwnedProject(input.authUserId, input.projectId)
    ) {
      return {
        userId: input.authUserId,
        userRole: "customer",
      };
    }

    const authContext = await authorizationService.getRequiredAuthContext(
      input.authUserId,
    );

    if (
      !authContext.employeeId ||
      !accessPolicyService.hasPermission(authContext, input.permissionCode)
    ) {
      throw Errors.business(
        403,
        "无权查看该项目摄像头",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      input.projectId,
      input.permissionCode,
    );

    if (!hasAccess) {
      throw Errors.business(
        403,
        "无权查看该项目摄像头",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    await this.assertProjectExists(input.projectId);

    return {
      userId: authContext.employeeId || input.authUserId,
      userRole: "employee",
      authContext,
    };
  }

  private async logAccess(input: {
    actor: CameraActor;
    projectId: string;
    cameraId?: string | null;
    action: CameraAccessLogAction;
    result?: "success" | "failure";
    errorMessage?: string | null;
    meta?: RequestLogMeta;
  }) {
    await projectCameraRepository.logAccess({
      project_id: input.projectId,
      camera_id: input.cameraId || null,
      user_id: input.actor.userId,
      user_role: input.actor.userRole,
      action: input.action,
      result: input.result,
      error_message: input.errorMessage,
      ip: getIp(input.meta),
      user_agent: getUserAgent(input.meta),
    });
  }

  async listProjectCameras(input: {
    authUserId?: string | null;
    projectId: string;
    meta?: RequestLogMeta;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.read",
      allowCustomer: true,
    });
    const cameras = await projectCameraRepository.listByProjectId(input.projectId);
    await this.logAccess({
      actor,
      projectId: input.projectId,
      action: "list",
      meta: input.meta,
    });

    return {
      list: cameras
        .filter((camera) => actor.userRole === "employee" || camera.can_view)
        .map(serializeCamera),
    };
  }

  async listEzvizDeviceChannels(input: {
    authUserId?: string | null;
    projectId: string;
    onlyUnbound: boolean;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const [channels, bindings] = await Promise.all([
      ezvizDeviceService.listDeviceChannels(),
      projectCameraRepository.listActiveBindingsByVendor("ezviz"),
    ]);
    const bindingMap = new Map(
      bindings.map((binding) => [
        buildDeviceChannelKey(binding.vendor_device_serial, binding.channel_no),
        binding,
      ]),
    );

    const list = channels.map((channel) => {
      const binding = bindingMap.get(
        buildDeviceChannelKey(channel.device_serial, channel.channel_no),
      );
      const isBound = Boolean(binding);
      const isBoundToCurrentProject = binding?.project_id === input.projectId;
      const boundProject = getBindingProject(binding?.project);

      return {
        device_name: channel.device_name,
        device_serial: channel.device_serial,
        channel_no: channel.channel_no,
        channel_name: channel.channel_name,
        status: channel.status,
        raw_status: channel.raw_status,
        video_encrypted: channel.video_encrypted,
        cover_url: channel.cover_url,
        is_bound: isBound,
        is_bound_to_current_project: isBoundToCurrentProject,
        bound_project_id: binding?.project_id || null,
        bound_project_name: boundProject?.name || null,
        bound_camera_id: binding?.id || null,
        bound_camera_name: binding?.name || null,
        can_bind: !isBound,
      };
    });

    return {
      list: input.onlyUnbound
        ? list.filter((item) => item.can_bind)
        : list,
    };
  }

  async getPlayParams(input: {
    authUserId?: string | null;
    projectId: string;
    cameraId: string;
    meta?: RequestLogMeta;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.read",
      allowCustomer: true,
    });
    const camera = await projectCameraRepository.findByProjectCamera(
      input.projectId,
      input.cameraId,
    );

    if (!camera) {
      await this.logAccess({
        actor,
        projectId: input.projectId,
        cameraId: input.cameraId,
        action: "play_params",
        result: "failure",
        errorMessage: "camera not found",
        meta: input.meta,
      });
      throw Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND);
    }

    if (!camera.can_view) {
      await this.logAccess({
        actor,
        projectId: input.projectId,
        cameraId: input.cameraId,
        action: "play_params",
        result: "failure",
        errorMessage: "camera view disabled",
        meta: input.meta,
      });
      throw Errors.business(
        403,
        "无权查看该项目摄像头",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    if (camera.video_encrypted) {
      await this.logAccess({
        actor,
        projectId: input.projectId,
        cameraId: input.cameraId,
        action: "play_params",
        result: "failure",
        errorMessage: "camera video encrypted",
        meta: input.meta,
      });
      throw Errors.business(
        409,
        "摄像头已开启视频加密，请联系管理员处理",
        ErrorCodes.CAMERA_VIDEO_ENCRYPTED,
      );
    }

    if (camera.status === "offline") {
      await this.logAccess({
        actor,
        projectId: input.projectId,
        cameraId: input.cameraId,
        action: "play_params",
        result: "failure",
        errorMessage: "camera offline",
        meta: input.meta,
      });
      throw Errors.business(409, "摄像头当前离线", ErrorCodes.CAMERA_OFFLINE);
    }

    const token = await ezvizTokenService.getValidAccessToken();
    await this.logAccess({
      actor,
      projectId: input.projectId,
      cameraId: input.cameraId,
      action: "play_params",
      meta: input.meta,
    });

    return {
      camera: serializeCameraForPlayer(camera),
      player: {
        provider: "ezplayer",
        plugin_version: await getEzplayerPluginVersion(),
        access_token: token.access_token,
        play_url: buildEzvizLiveUrl(
          camera.vendor_device_serial,
          camera.channel_no,
        ),
        expires_at: token.expires_at,
      },
    };
  }

  async createProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    payload: CreateProjectCameraInput;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const camera = await projectCameraRepository.create(
      input.projectId,
      input.payload,
    );

    return { id: camera.id };
  }

  async updateProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    cameraId: string;
    payload: UpdateProjectCameraInput;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const camera = await projectCameraRepository.update(
      input.projectId,
      input.cameraId,
      input.payload,
    );

    return serializeCamera(camera);
  }

  async deleteProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    cameraId: string;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });
    await projectCameraRepository.softDelete(input.projectId, input.cameraId);
    return { success: true };
  }
}

export const projectCameraService = new ProjectCameraService();
