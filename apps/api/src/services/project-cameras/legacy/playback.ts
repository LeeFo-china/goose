import {
  Errors,
  ErrorCodes,
  accessPolicyService,
  authorizationService,
  buildDeviceChannelKey,
  buildEzvizLiveUrl,
  buildTenantDeviceChannelKey,
  buildTencentDeviceChannelKey,
  buildUniqueDeviceNameCandidate,
  chooseTencentPlayUrl,
  createTenantDeviceAssetMap,
  ezvizDeviceService,
  ezvizTokenService,
  generateDeviceNameFallback,
  generateSipPassword,
  getBindingProject,
  getEzplayerPluginVersion,
  getIp,
  getTencentDeviceTypeLabel,
  getUserAgent,
  normalizeCameraStatus,
  normalizeDeviceName,
  projectCameraRepository,
  projectRepository,
  projectStatusService,
  serializeAssetState,
  serializeCamera,
  serializeCameraForPlayer,
  tenantDeviceRepository,
  tencentDeviceNameExists,
  tencentIotVideoService,
  withCameraStatus,
  type CameraAccessLogAction,
  type CameraActor,
  type CreateProjectCameraInput,
  type CreateProjectCameraTencentDeviceInput,
  type ProjectCameraBindOptionsQueryInput,
  type ProjectCameraProjectGroupsQueryInput,
  type ProjectCameraRow,
  type RequestLogMeta,
  type TenantServiceAccessInput,
  type UpdateProjectCameraInput,
  type UpdateProjectCameraTencentDevicePasswordInput,
} from "./shared";

export async function getPlayParams(this: any, input: TenantServiceAccessInput & {
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
    tenantServiceAccess: input.tenantServiceAccess,
  });
  const camera = await projectCameraRepository.findByProjectCamera(
    input.projectId,
    input.cameraId,
    actor.tenantId,
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
