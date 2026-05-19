import { randomBytes, randomInt } from "node:crypto";
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
import { tenantDeviceRepository, type TenantDeviceRow } from "@/repositories/tenant-devices";
import { SupabaseDB } from "@/utils/supabase";
import type {
  CreateProjectCameraInput,
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraProjectGroupsQueryInput,
  CreateProjectCameraTencentDeviceInput,
  UpdateProjectCameraTencentDevicePasswordInput,
  UpdateProjectCameraInput,
} from "@/schema/project-cameras";

type CameraActor = {
  userId: string;
  userRole: "customer" | "employee";
  tenantId: string | null;
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

function buildTenantDeviceChannelKey(
  vendor: string,
  deviceSerial: string,
  channelId?: string | number | null,
) {
  return `${vendor}:${deviceSerial}:${channelId || ""}`;
}

function createTenantDeviceAssetMap(assets: TenantDeviceRow[]) {
  return new Map(assets.map((asset) => [
    buildTenantDeviceChannelKey(
      asset.vendor,
      asset.vendor_device_serial,
      asset.vendor_channel_id,
    ),
    asset,
  ]));
}

function serializeAssetState(asset: TenantDeviceRow | null | undefined, tenantId: string | null) {
  const isInTenantAssetPool = Boolean(asset);
  const isAssetOwnedByCurrentTenant = Boolean(asset && asset.tenant_id === tenantId);

  return {
    tenant_device_id: asset?.id || null,
    is_in_tenant_asset_pool: isInTenantAssetPool,
    is_asset_owned_by_current_tenant: isAssetOwnedByCurrentTenant,
    is_asset_owned_by_other_tenant: Boolean(asset && asset.tenant_id !== tenantId),
    can_import_asset: !asset,
  };
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

function getTencentDeviceTypeLabel(value: number | null | undefined) {
  if (value === 2) return "IPC";
  if (value === 3) return "NVR";
  if (value === 1) return "VMS";
  if (value === 9) return "智能告警设备";
  return value == null ? "未知设备" : `类型 ${value}`;
}

function generateSipPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_";
  const bytes = randomBytes(12);
  let password = "";

  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }

  return password;
}

function generateDeviceNameFallback(deviceType: number) {
  const prefix = deviceType === 3 ? "NVR" : "IPC";
  return `${prefix}-${randomInt(1000, 9999)}`;
}

function normalizeDeviceName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildUniqueDeviceNameCandidate(baseName: string) {
  const suffix = `-${randomInt(1000, 9999)}`;
  return `${baseName.slice(0, 48 - suffix.length)}${suffix}`;
}

async function tencentDeviceNameExists(name: string) {
  const normalizedName = normalizeDeviceName(name);
  const devices = await tencentIotVideoService.listDeviceSummaries(normalizedName);
  return devices.some((device) =>
    normalizeDeviceName(device.device_name || "") === normalizedName
  );
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
      await tenantDeviceRepository.updateStatusByCameraId({
        cameraId: input.cameraId,
        status: input.status,
        rawStatus: input.errorMessage || null,
      });
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

  private async getCustomerOwnedProjectTenant(authUserId: string, projectId: string) {
    const { data: customers, error: customerError } = await this.adminClient
      .from("customers")
      .select("id, tenant_id")
      .eq("user_id", authUserId);

    if (customerError) {
      throw Errors.dbError("查询客户项目权限失败", customerError);
    }

    const customerRows = (customers || []) as Array<{
      id?: string | null;
      tenant_id?: string | null;
    }>;
    const customerIds = customerRows
      .map((customer) => customer.id)
      .filter((id): id is string => Boolean(id));
    if (!customerIds.length) {
      return null;
    }

    const { data: project, error: projectError } = await this.adminClient
      .from("projects")
      .select("id, tenant_id, customer_id, status")
      .eq("id", projectId)
      .in("customer_id", customerIds)
      .maybeSingle();

    if (projectError) {
      throw Errors.dbError("查询客户项目权限失败", projectError);
    }

    const projectRow = project as {
      tenant_id?: string | null;
      customer_id?: string | null;
      status?: string | null;
    } | null;
    const customer = customerRows.find((item) =>
      item.id === projectRow?.customer_id && item.tenant_id === projectRow?.tenant_id
    );
    if (!projectRow || !customer) {
      return null;
    }

    const status = projectRow.status;
    if (status === "completed" || status === "invalid") {
      return null;
    }

    return projectRow.tenant_id || null;
  }

  private async assertProjectExists(projectId: string, tenantId?: string | null) {
    const project = await projectCameraRepository.getProject(projectId, tenantId);
    if (!project) {
      throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
    }

    return project;
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

    const customerTenantId = input.allowCustomer
      ? await this.getCustomerOwnedProjectTenant(input.authUserId, input.projectId)
      : null;
    if (input.allowCustomer && customerTenantId) {
      return {
        userId: input.authUserId,
        userRole: "customer",
        tenantId: customerTenantId,
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

    const tenantId = accessPolicyService.assertTenantContext(authContext);
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

    await this.assertProjectExists(input.projectId, tenantId);

    return {
      userId: authContext.employeeId || input.authUserId,
      userRole: "employee",
      tenantId,
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
      tenant_id: input.actor.tenantId,
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
      await projectCameraRepository.listByProjectId(input.projectId, actor.tenantId),
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

  async listCameraBindProjectOptions(input: {
    authUserId?: string | null;
    query: ProjectCameraBindOptionsQueryInput;
  }) {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    const authContext = await authorizationService.getRequiredAuthContext(
      input.authUserId,
    );
    if (!authContext.employeeId) {
      throw Errors.business(
        403,
        "无权绑定项目摄像头",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.update",
    );

    return projectCameraRepository.listCameraBindProjectOptions({
      ...input.query,
      tenantId,
      visibleProjectIds,
    });
  }

  async listCameraProjectGroups(input: {
    authUserId?: string | null;
    query: ProjectCameraProjectGroupsQueryInput;
  }) {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    const authContext = await authorizationService.getRequiredAuthContext(
      input.authUserId,
    );
    if (!authContext.employeeId) {
      throw Errors.business(
        403,
        "无权查看项目摄像头",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const result = await projectCameraRepository.listCameraProjectGroups({
      ...input.query,
      tenantId,
      visibleProjectIds,
    });
    const enrichedCameras = await this.enrichTencentCameraStatuses(
      result.list.flatMap((group) => group.cameras),
    );
    const cameraMap = new Map(
      enrichedCameras.map((camera) => [camera.id, camera]),
    );

    return {
      list: result.list.map((group) => {
        const cameras = group.cameras.map((camera) =>
          cameraMap.get(camera.id) || camera
        );

        return {
          project: group.project,
          cameras: cameras.map(serializeCamera),
          summary: {
            camera_count: cameras.length,
            online_count: cameras.filter((camera) =>
              normalizeCameraStatus(camera.status) === "online"
            ).length,
            hidden_count: cameras.filter((camera) => !camera.can_view).length,
            tencent_count: cameras.filter((camera) =>
              camera.vendor === "tencent_iotvideo_industry"
            ).length,
          },
        };
      }),
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  async listEzvizDeviceChannels(input: {
    authUserId?: string | null;
    projectId: string;
    onlyUnbound: boolean;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const [channels, bindings, tenantDeviceAssets] = await Promise.all([
      ezvizDeviceService.listDeviceChannels(),
      projectCameraRepository.listActiveBindingsByVendor("ezviz"),
      tenantDeviceRepository.listActiveByVendor("ezviz"),
    ]);
    const bindingMap = new Map(
      bindings.map((binding) => [
        buildDeviceChannelKey(binding.vendor_device_serial, binding.channel_no),
        binding,
      ]),
    );
    const assetMap = createTenantDeviceAssetMap(tenantDeviceAssets);

    const list = channels.map((channel) => {
      const binding = bindingMap.get(
        buildDeviceChannelKey(channel.device_serial, channel.channel_no),
      );
      const asset = assetMap.get(
        buildTenantDeviceChannelKey("ezviz", channel.device_serial, null),
      );
      const isBound = Boolean(binding);
      const isOwnTenantBinding = binding?.tenant_id === actor.tenantId;
      const isBoundToCurrentProject = binding?.project_id === input.projectId;
      const boundProject = isOwnTenantBinding
        ? getBindingProject(binding?.project)
        : undefined;
      const assetState = serializeAssetState(asset, actor.tenantId);

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
        is_bound_to_current_project: isOwnTenantBinding && isBoundToCurrentProject,
        bound_project_id: isOwnTenantBinding ? binding?.project_id || null : null,
        bound_project_name: boundProject?.name || null,
        bound_camera_id: isOwnTenantBinding ? binding?.id || null : null,
        bound_camera_name: isOwnTenantBinding ? binding?.name || null : null,
        can_bind: !isBound && assetState.is_asset_owned_by_current_tenant,
        ...assetState,
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
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const [deviceSummaries, channels, bindings, tenantDeviceAssets] = await Promise.all([
      tencentIotVideoService.listDeviceSummaries(input.keyword),
      tencentIotVideoService.listDeviceChannels(input.keyword),
      projectCameraRepository.listActiveBindingsByVendor("tencent_iotvideo_industry"),
      tenantDeviceRepository.listActiveByVendor("tencent_iotvideo_industry"),
    ]);
    const sipServer = await tencentIotVideoService.getSipServerConfig().catch(() => null);
    const bindingMap = new Map(
      bindings.map((binding) => [
        buildTencentDeviceChannelKey(
          binding.vendor_device_serial,
          binding.vendor_channel_id,
        ),
        binding,
      ]),
    );
    const assetMap = createTenantDeviceAssetMap(tenantDeviceAssets);

    const devices = deviceSummaries.map((device) => ({
      device_id: device.device_id,
      device_code: device.device_code,
      device_name: device.device_name,
      device_type: device.device_type,
      device_type_label: getTencentDeviceTypeLabel(device.device_type),
      sip_username: device.device_code,
      sip_transport_protocol: "TCP",
      status: device.status,
      raw_status: device.raw_status,
      protocol: device.protocol,
      group_id: device.group_id,
      group_name: device.group_name,
    }));

    const list = channels.map((channel) => {
      const binding = bindingMap.get(
        buildTencentDeviceChannelKey(channel.device_id, channel.channel_id),
      );
      const asset = assetMap.get(
        buildTenantDeviceChannelKey(
          "tencent_iotvideo_industry",
          channel.device_id,
          channel.channel_id,
        ),
      );
      const isBound = Boolean(binding);
      const isOwnTenantBinding = binding?.tenant_id === actor.tenantId;
      const isBoundToCurrentProject = binding?.project_id === input.projectId;
      const boundProject = isOwnTenantBinding
        ? getBindingProject(binding?.project)
        : undefined;
      const assetState = serializeAssetState(asset, actor.tenantId);

      return {
        device_id: channel.device_id,
        device_code: channel.device_code,
        device_name: channel.device_name,
        device_type: channel.device_type,
        device_type_label: getTencentDeviceTypeLabel(channel.device_type),
        sip_username: channel.device_code,
        sip_transport_protocol: "TCP",
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
        is_bound_to_current_project: isOwnTenantBinding && isBoundToCurrentProject,
        bound_project_id: isOwnTenantBinding ? binding?.project_id || null : null,
        bound_project_name: boundProject?.name || null,
        bound_camera_id: isOwnTenantBinding ? binding?.id || null : null,
        bound_camera_name: isOwnTenantBinding ? binding?.name || null : null,
        can_bind: !isBound && assetState.is_asset_owned_by_current_tenant,
        ...assetState,
      };
    });

    return {
      sip_server: sipServer,
      devices,
      list: input.onlyUnbound
        ? list.filter((item) => item.can_bind)
        : list,
    };
  }

  async createTencentDevice(input: {
    authUserId?: string | null;
    projectId: string;
    payload: CreateProjectCameraTencentDeviceInput;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });
    if (!actor.tenantId) {
      throw Errors.business(403, "缺少租户上下文", ErrorCodes.CAMERA_ACCESS_DENIED);
    }

    const password = input.payload.password?.trim() || generateSipPassword();
    const originalName = normalizeDeviceName(
      input.payload.name || generateDeviceNameFallback(input.payload.device_type),
    );
    let name = originalName;

    if (await tencentDeviceNameExists(originalName)) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = buildUniqueDeviceNameCandidate(originalName);
        if (!await tencentDeviceNameExists(candidate)) {
          name = candidate;
          break;
        }
      }
    }

    const created = await tencentIotVideoService.createDevice({
      name,
      password,
      deviceType: input.payload.device_type,
      groupId: input.payload.group_id,
    });
    const sipServer = await tencentIotVideoService.getSipServerConfig().catch(() => null);
    if (created.device_id) {
      const existing = await tenantDeviceRepository.findByVendorDeviceChannel({
        vendor: "tencent_iotvideo_industry",
        vendor_device_serial: created.device_id,
        vendor_channel_id: null,
      });
      if (!existing) {
        await tenantDeviceRepository.create({
          tenant_id: actor.tenantId,
          vendor: "tencent_iotvideo_industry",
          vendor_device_serial: created.device_id,
          vendor_device_code: created.device_code,
          vendor_device_name: name,
          vendor_channel_id: null,
          vendor_channel_code: null,
          vendor_channel_name: null,
          device_type: getTencentDeviceTypeLabel(input.payload.device_type),
          source_project_id: input.projectId,
          status: "unknown",
          metadata: {
            virtual_group_id: created.virtual_group_id,
            group_id: input.payload.group_id || null,
            sip_transport_protocol: "TCP",
          },
          created_by: actor.authContext?.employeeId || null,
        });
      }
    }

    return {
      device: {
        device_id: created.device_id,
        device_code: created.device_code,
        device_name: name,
        device_type: input.payload.device_type,
        device_type_label: getTencentDeviceTypeLabel(input.payload.device_type),
        virtual_group_id: created.virtual_group_id,
        sip_username: created.device_code,
        sip_password: password,
        sip_transport_protocol: "TCP",
        request_id: created.request_id,
        original_device_name: originalName,
        name_adjusted: name !== originalName,
      },
      sip_server: sipServer,
    };
  }

  async getTencentDevicePassword(input: {
    authUserId?: string | null;
    projectId: string;
    deviceId: string;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const result = await tencentIotVideoService.getDevicePassword(input.deviceId);

    return {
      device_id: input.deviceId,
      sip_password: result.password,
      request_id: result.request_id,
    };
  }

  async resetTencentDevicePassword(input: {
    authUserId?: string | null;
    projectId: string;
    deviceId: string;
    payload: UpdateProjectCameraTencentDevicePasswordInput;
  }) {
    await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const password = input.payload.password?.trim() || generateSipPassword();
    const result = await tencentIotVideoService.updateDevicePassword({
      deviceId: input.deviceId,
      password,
    });

    if (result.status !== "OK") {
      throw Errors.business(
        503,
        "腾讯云设备密码重置失败",
        ErrorCodes.TENCENT_IOT_VIDEO_API_ERROR,
        result,
      );
    }

    return {
      device_id: input.deviceId,
      sip_password: password,
      status: result.status,
      request_id: result.request_id,
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

  async createProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    payload: CreateProjectCameraInput;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });
    if (!actor.tenantId) {
      throw Errors.business(403, "缺少租户上下文", ErrorCodes.CAMERA_ACCESS_DENIED);
    }
    const existingDevice = await tenantDeviceRepository.findByVendorDeviceChannel({
      vendor: input.payload.vendor,
      vendor_device_serial: input.payload.vendor_device_serial,
      vendor_channel_id: input.payload.vendor_channel_id,
    });
    if (existingDevice && existingDevice.tenant_id !== actor.tenantId) {
      throw Errors.business(
        409,
        "该设备已归属其他租户",
        ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
      );
    }
    if (
      existingDevice?.bound_camera_id &&
      existingDevice.bound_project_id !== input.projectId
    ) {
      throw Errors.business(
        409,
        "该设备已绑定到当前租户其他项目，请先解绑后再绑定",
        ErrorCodes.CAMERA_ALREADY_BOUND,
      );
    }

    const camera = await projectCameraRepository.create(
      input.projectId,
      input.payload,
      actor.tenantId,
    );
    await tenantDeviceRepository.upsertFromProjectCamera(
      camera,
      actor.authContext?.employeeId || null,
    );

    return { id: camera.id };
  }

  async updateProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    cameraId: string;
    payload: UpdateProjectCameraInput;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });

    const camera = await projectCameraRepository.update(
      input.projectId,
      input.cameraId,
      input.payload,
      actor.tenantId,
    );

    return serializeCamera(camera);
  }

  async deleteProjectCamera(input: {
    authUserId?: string | null;
    projectId: string;
    cameraId: string;
  }) {
    const actor = await this.resolveActor({
      authUserId: input.authUserId,
      projectId: input.projectId,
      permissionCode: "project.update",
      allowCustomer: false,
    });
    await projectCameraRepository.softDelete(input.projectId, input.cameraId, actor.tenantId);
    await tenantDeviceRepository.markUnboundByCameraId(
      input.cameraId,
      actor.authContext?.employeeId || null,
    );
    return { success: true };
  }
}

export const projectCameraService = new ProjectCameraService();
