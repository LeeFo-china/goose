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

export async function listEzvizDeviceChannels(this: any, input: TenantServiceAccessInput & {
  authUserId?: string | null;
  projectId: string;
  onlyUnbound: boolean;
}) {
  const actor = await this.resolveActor({
    authUserId: input.authUserId,
    projectId: input.projectId,
    permissionCode: "project.update",
    allowCustomer: false,
    tenantServiceAccess: input.tenantServiceAccess,
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

export async function listTencentDeviceChannels(this: any, input: TenantServiceAccessInput & {
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
    tenantServiceAccess: input.tenantServiceAccess,
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
