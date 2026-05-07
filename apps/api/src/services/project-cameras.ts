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
import { tencentIotVideoService } from "@/services/tencent-iot-video";
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

function normalizeCameraStatus(value: unknown): ProjectCameraRow["status"] {
  if (
    value === "online" ||
    value === "1" ||
    value === 1 ||
    value === true ||
    value === "true" ||
    value === "connected"
  ) {
    return "online";
  }

  if (
    value === "offline" ||
    value === "0" ||
    value === 0 ||
    value === false ||
    value === "false" ||
    value === "disconnected"
  ) {
    return "offline";
  }

  return "unknown";
}

function withCameraStatus(
  camera: ProjectCameraRow,
  status: ProjectCameraRow["status"],
): ProjectCameraRow {
  return {
    ...camera,
    status,
  };
}

function serializeCamera(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    vendor: camera.vendor,
    name: camera.name,
    position: camera.position,
    status: normalizeCameraStatus(camera.status),
    can_view: camera.can_view,
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
    cover_url: camera.cover_url,
    sort_order: camera.sort_order,
    video_encrypted: camera.video_encrypted,
    play_protocol: camera.play_protocol,
  };
}

function serializeCameraForPlayer(camera: ProjectCameraRow) {
  return {
    id: camera.id,
    vendor: camera.vendor,
    name: camera.name,
    status: normalizeCameraStatus(camera.status),
    can_control: camera.can_control,
    capabilities: normalizeCapabilities(camera.capabilities),
  };
}

function buildDeviceChannelKey(deviceSerial: string, channelNo: number) {
  return `${deviceSerial}:${channelNo}`;
}

function buildTencentDeviceChannelKey(deviceId: string, channelId: string | null | undefined) {
  return `${deviceId}:${channelId || ""}`;
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

function chooseTencentPlayUrl(input: {
  protocol: "flv" | "rtmp" | "hls";
  flvUrl: string | null;
  rtmpUrl: string | null;
  hlsUrl: string | null;
}) {
  if (input.protocol === "rtmp" && input.rtmpUrl) {
    return {
      protocol: "rtmp" as const,
      src: input.rtmpUrl,
    };
  }

  if (input.protocol === "hls" && input.hlsUrl) {
    return {
      protocol: "hls" as const,
      src: input.hlsUrl,
    };
  }

  if (input.flvUrl) {
    return {
      protocol: "flv" as const,
      src: input.flvUrl,
    };
  }

  if (input.rtmpUrl) {
    return {
      protocol: "rtmp" as const,
      src: input.rtmpUrl,
    };
  }

  if (input.hlsUrl) {
    return {
      protocol: "hls" as const,
      src: input.hlsUrl,
    };
  }

  return null;
}

class ProjectCameraService {
  private adminClient = SupabaseDB.getAdminClient();

  private async saveCameraStatus(input: {
    cameraId: string;
    status: ProjectCameraRow["status"];
    errorMessage?: string | null;
  }) {
    try {
      await projectCameraRepository.updateStatus(input);
    } catch {
      // 状态回写只用于提升列表体验，不能影响播放主链路。
    }
  }

  private async enrichTencentCameraStatuses(cameras: ProjectCameraRow[]) {
    const tencentCameras = cameras.filter((camera) =>
      camera.vendor === "tencent_iotvideo_industry" && camera.vendor_channel_id
    );
    if (!tencentCameras.length) return cameras;

    try {
      const channels = await tencentIotVideoService.listDeviceChannels();
      const statusMap = new Map(
        channels.map((channel) => [
          buildTencentDeviceChannelKey(channel.device_id, channel.channel_id),
          normalizeCameraStatus(channel.status),
        ]),
      );

      const changed: Array<{
        cameraId: string;
        status: ProjectCameraRow["status"];
      }> = [];
      const nextCameras = cameras.map((camera) => {
        if (camera.vendor !== "tencent_iotvideo_industry" || !camera.vendor_channel_id) {
          return camera;
        }

        const status = statusMap.get(
          buildTencentDeviceChannelKey(camera.vendor_device_serial, camera.vendor_channel_id),
        );
        if (!status) return camera;
        if (status !== camera.status) {
          changed.push({
            cameraId: camera.id,
            status,
          });
        }
        return withCameraStatus(camera, status);
      });

      await Promise.all(changed.map((item) =>
        this.saveCameraStatus({
          cameraId: item.cameraId,
          status: item.status,
        })
      ));

      return nextCameras;
    } catch {
      return cameras;
    }
  }

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
    const cameras = await this.enrichTencentCameraStatuses(
      await projectCameraRepository.listByProjectId(input.projectId),
    );
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

  async listTencentDeviceChannels(input: {
    authUserId?: string | null;
    projectId: string;
    onlyUnbound: boolean;
    keyword?: string | null;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const [channels, bindings] = await Promise.all([
      tencentIotVideoService.listDeviceChannels(input.keyword),
      projectCameraRepository.listActiveBindingsByVendor("tencent_iotvideo_industry"),
    ]);
    const bindingMap = new Map(
      bindings.map((binding) => [
        buildTencentDeviceChannelKey(
          binding.vendor_device_serial,
          binding.vendor_channel_id,
        ),
        binding,
      ]),
    );

    const list = channels.map((channel) => {
      const binding = bindingMap.get(
        buildTencentDeviceChannelKey(channel.device_id, channel.channel_id),
      );
      const isBound = Boolean(binding);
      const isBoundToCurrentProject = binding?.project_id === input.projectId;
      const boundProject = getBindingProject(binding?.project);

      return {
        device_id: channel.device_id,
        device_code: channel.device_code,
        device_name: channel.device_name,
        device_type: channel.device_type,
        channel_id: channel.channel_id,
        channel_code: channel.channel_code,
        channel_name: channel.channel_name,
        channel_type: channel.channel_type,
        status: channel.status,
        raw_status: channel.raw_status,
        protocol: channel.protocol,
        group_id: channel.group_id,
        group_name: channel.group_name,
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

    if (camera.status === "offline" && camera.vendor !== "tencent_iotvideo_industry") {
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

    if (camera.vendor === "tencent_iotvideo_industry") {
      if (!camera.vendor_channel_id) {
        await this.logAccess({
          actor,
          projectId: input.projectId,
          cameraId: input.cameraId,
          action: "play_params",
          result: "failure",
          errorMessage: "tencent channel id missing",
          meta: input.meta,
        });
        throw Errors.business(
          409,
          "摄像头缺少腾讯云通道 ID",
          ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
        );
      }

      let liveStream;
      try {
        liveStream = await tencentIotVideoService.getLiveStreamUrl({
          deviceId: camera.vendor_device_serial,
          channelId: camera.vendor_channel_id,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "tencent live stream failed";
        const errorCode = error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
        await this.saveCameraStatus({
          cameraId: camera.id,
          status: errorCode === ErrorCodes.CAMERA_OFFLINE || errorMessage.includes("离线")
            ? "offline"
            : "unknown",
          errorMessage,
        });
        await this.logAccess({
          actor,
          projectId: input.projectId,
          cameraId: input.cameraId,
          action: "play_params",
          result: "failure",
          errorMessage,
          meta: input.meta,
        });
        throw error;
      }

      const selected = chooseTencentPlayUrl({
        protocol: camera.play_protocol,
        flvUrl: liveStream.flv_url,
        rtmpUrl: liveStream.rtmp_url,
        hlsUrl: liveStream.hls_url,
      });
      if (!selected) {
        await this.logAccess({
          actor,
          projectId: input.projectId,
          cameraId: input.cameraId,
          action: "play_params",
          result: "failure",
          errorMessage: `tencent live stream empty, request_id=${liveStream.request_id || ""}`,
          meta: input.meta,
        });
        throw Errors.business(
          503,
          "腾讯云播放地址为空",
          ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
          { request_id: liveStream.request_id },
        );
      }

      await this.logAccess({
        actor,
        projectId: input.projectId,
        cameraId: input.cameraId,
        action: "play_params",
        meta: input.meta,
      });
      await this.saveCameraStatus({
        cameraId: camera.id,
        status: "online",
      });

      const onlineCamera = withCameraStatus(camera, "online");

      return {
        camera: serializeCameraForPlayer(onlineCamera),
        player: {
          provider: "tencent_iot_video_industry",
          protocol: selected.protocol,
          src: selected.src,
          flv_url: liveStream.flv_url,
          rtmp_url: liveStream.rtmp_url,
          hls_url: liveStream.hls_url,
          rtsp_url: liveStream.rtsp_url,
          request_id: liveStream.request_id,
          expires_at: null,
        },
      };
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
