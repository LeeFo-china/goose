import { randomBytes } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { projectCameraRepository } from "@/repositories/project-cameras";
import {
  tenantDeviceRepository,
  type TenantDeviceRow,
} from "@/repositories/tenant-devices";
import type {
  CreateTenantDeviceInput,
  PlatformTenantDeviceListQueryInput,
  TenantDeviceListQueryInput,
  UpdateTenantDeviceInput,
} from "@/schema/tenant-devices";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { ezvizDeviceService } from "@/services/ezviz";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { tencentIotVideoService } from "@/services/tencent-iot-video";

function getTencentDeviceTypeLabel(value: number | null | undefined) {
  if (value === 2) return "IPC";
  if (value === 3) return "NVR";
  if (value === 1) return "VMS";
  if (value === 9) return "智能告警设备";
  return value == null ? null : `类型 ${value}`;
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

class TenantDeviceService {
  private async getTenantAuthContext(authUserId?: string | null, permissionCode = "project.read") {
    if (!authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    const authContext = await authorizationService.getRequiredAuthContext(authUserId);
    if (!authContext.employeeId || !accessPolicyService.hasPermission(authContext, permissionCode)) {
      throw Errors.business(
        403,
        "无权访问设备资产",
        ErrorCodes.CAMERA_ACCESS_DENIED,
      );
    }

    return authContext;
  }

  async listTenantDevices(input: {
    authUserId?: string | null;
    query: TenantDeviceListQueryInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.read");
    const tenantId = accessPolicyService.assertTenantContext(authContext);

    return tenantDeviceRepository.list({
      ...input.query,
      tenantId,
    });
  }

  async listPlatformTenantDevices(
    query: PlatformTenantDeviceListQueryInput,
    authContext: AuthContext,
  ) {
    this.assertPlatformAdmin(authContext);
    return tenantDeviceRepository.listPlatform(query);
  }

  async getTenantDevice(input: {
    authUserId?: string | null;
    id: string;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.read");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const device = await tenantDeviceRepository.findById(input.id, tenantId);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    return device;
  }

  async createTenantDevice(input: {
    authUserId?: string | null;
    payload: CreateTenantDeviceInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const project = await projectCameraRepository.getProject(
      input.payload.source_project_id,
      tenantId,
    );
    if (!project) {
      throw Errors.business(404, "项目不存在", "PROJECT_NOT_FOUND");
    }

    const existing = await tenantDeviceRepository.findByVendorDeviceChannel({
      vendor: input.payload.vendor,
      vendor_device_serial: input.payload.vendor_device_serial,
      vendor_channel_id: input.payload.vendor_channel_id,
    });
    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw Errors.business(
          409,
          "该设备已归属其他租户",
          ErrorCodes.CAMERA_BOUND_TO_ANOTHER_PROJECT,
        );
      }

      throw Errors.business(409, "该设备资产已存在", ErrorCodes.CAMERA_ALREADY_BOUND);
    }

    return tenantDeviceRepository.create({
      ...input.payload,
      tenant_id: tenantId,
      created_by: authContext.employeeId,
    });
  }

  async updateTenantDevice(input: {
    authUserId?: string | null;
    id: string;
    payload: UpdateTenantDeviceInput;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const device = await tenantDeviceRepository.findById(input.id, tenantId);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    return tenantDeviceRepository.update(input.id, {
      ...input.payload,
      updated_by: authContext.employeeId,
    }, tenantId);
  }

  async deleteTenantDevice(input: {
    authUserId?: string | null;
    id: string;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const device = await tenantDeviceRepository.findById(input.id, tenantId);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    if (device.bound_camera_id || device.bound_project_id) {
      throw Errors.business(
        409,
        "设备已绑定项目，请先解绑项目摄像头后再删除",
        ErrorCodes.CAMERA_ALREADY_BOUND,
      );
    }

    await tenantDeviceRepository.softDelete(
      input.id,
      tenantId,
      authContext.employeeId,
    );

    return { success: true };
  }

  async syncTenantDevices(input: {
    authUserId?: string | null;
  }) {
    const authContext = await this.getTenantAuthContext(input.authUserId, "project.update");
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const assets = await tenantDeviceRepository.listAllByTenant(tenantId);
    return this.syncAssets({
      tenantId,
      assets,
      updatedBy: authContext.employeeId,
    });
  }

  async getPlatformTencentDeviceAccessInfo(id: string, authContext: AuthContext) {
    const device = await this.getRequiredPlatformTencentDevice(id, authContext);
    const sipServer = await tencentIotVideoService.getSipServerConfig();

    await platformAuditLogService.recordBestEffort({
      action: "platform_device_access_view",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: device.tenant_id,
      resourceType: "tenant_device",
      resourceId: device.id,
      resourceLabel: this.getDeviceLabel(device),
      summary: `查看设备「${this.getDeviceLabel(device)}」接入信息`,
      metadata: {
        vendor: device.vendor,
        vendor_device_serial: device.vendor_device_serial,
        vendor_channel_id: device.vendor_channel_id,
      },
    });

    return {
      device: {
        tenant_device_id: device.id,
        device_id: device.vendor_device_serial,
        device_code: device.vendor_device_code,
        device_name: device.vendor_device_name,
        channel_id: device.vendor_channel_id,
        channel_code: device.vendor_channel_code,
        channel_name: device.vendor_channel_name,
        device_type_label: device.device_type,
        sip_username: device.vendor_device_code || device.vendor_device_serial,
        sip_transport_protocol: "TCP" as const,
        source_project_id: device.source_project_id,
        bound_project_id: device.bound_project_id,
      },
      sip_server: sipServer,
    };
  }

  async getPlatformTencentDevicePassword(id: string, authContext: AuthContext) {
    const device = await this.getRequiredPlatformTencentDevice(id, authContext);
    const result = await tencentIotVideoService.getDevicePassword(device.vendor_device_serial);

    await platformAuditLogService.recordBestEffort({
      action: "platform_device_password_query",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: device.tenant_id,
      resourceType: "tenant_device",
      resourceId: device.id,
      resourceLabel: this.getDeviceLabel(device),
      summary: `查询设备「${this.getDeviceLabel(device)}」SIP密码`,
      metadata: {
        vendor: device.vendor,
        vendor_device_serial: device.vendor_device_serial,
      },
    });

    return {
      tenant_device_id: device.id,
      device_id: device.vendor_device_serial,
      device_code: device.vendor_device_code,
      device_name: device.vendor_device_name,
      sip_username: device.vendor_device_code || device.vendor_device_serial,
      sip_transport_protocol: "TCP" as const,
      sip_password: result.password,
      request_id: result.request_id,
    };
  }

  async resetPlatformTencentDevicePassword(id: string, authContext: AuthContext) {
    const device = await this.getRequiredPlatformTencentDevice(id, authContext);
    const password = generateSipPassword();
    const result = await tencentIotVideoService.updateDevicePassword({
      deviceId: device.vendor_device_serial,
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

    await platformAuditLogService.recordBestEffort({
      action: "platform_device_password_reset",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: device.tenant_id,
      resourceType: "tenant_device",
      resourceId: device.id,
      resourceLabel: this.getDeviceLabel(device),
      summary: `重置设备「${this.getDeviceLabel(device)}」SIP密码`,
      metadata: {
        vendor: device.vendor,
        vendor_device_serial: device.vendor_device_serial,
        request_id: result.request_id,
      },
    });

    return {
      tenant_device_id: device.id,
      device_id: device.vendor_device_serial,
      device_code: device.vendor_device_code,
      device_name: device.vendor_device_name,
      sip_username: device.vendor_device_code || device.vendor_device_serial,
      sip_transport_protocol: "TCP" as const,
      sip_password: password,
      status: result.status,
      request_id: result.request_id,
    };
  }

  async syncPlatformTenantDevice(id: string, authContext: AuthContext) {
    const device = await this.getRequiredPlatformDevice(id, authContext);
    const result = await this.syncAssets({
      tenantId: device.tenant_id,
      assets: [device],
      updatedBy: authContext.employeeId,
    });

    await platformAuditLogService.recordBestEffort({
      action: "platform_device_sync",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: device.tenant_id,
      resourceType: "tenant_device",
      resourceId: device.id,
      resourceLabel: this.getDeviceLabel(device),
      summary: `同步设备「${this.getDeviceLabel(device)}」资产`,
      metadata: {
        vendor: device.vendor,
        vendor_device_serial: device.vendor_device_serial,
        result,
      },
    });

    return result;
  }

  private async syncAssets(input: {
    tenantId: string;
    assets: TenantDeviceRow[];
    updatedBy?: string | null;
  }) {
    const sourceProjectByDevice = new Map<string, string | null>();
    const tencentDeviceIds = new Set<string>();
    const ezvizDeviceSerials = new Set<string>();

    for (const asset of input.assets) {
      sourceProjectByDevice.set(
        `${asset.vendor}:${asset.vendor_device_serial}`,
        asset.source_project_id,
      );
      if (asset.vendor === "tencent_iotvideo_industry") {
        tencentDeviceIds.add(asset.vendor_device_serial);
      }
      if (asset.vendor === "ezviz") {
        ezvizDeviceSerials.add(asset.vendor_device_serial);
      }
    }

    let createdCount = 0;
    let updatedCount = 0;

    if (tencentDeviceIds.size > 0) {
      const channels = await tencentIotVideoService.listDeviceChannels();
      for (const channel of channels) {
        if (!tencentDeviceIds.has(channel.device_id)) continue;

        const result = await tenantDeviceRepository.upsertSynced({
          tenant_id: input.tenantId,
          vendor: "tencent_iotvideo_industry",
          vendor_device_serial: channel.device_id,
          vendor_device_code: channel.device_code,
          vendor_device_name: channel.device_name,
          vendor_channel_id: channel.channel_id,
          vendor_channel_code: channel.channel_code,
          vendor_channel_name: channel.channel_name,
          device_type: getTencentDeviceTypeLabel(channel.device_type),
          source_project_id: sourceProjectByDevice.get(
            `tencent_iotvideo_industry:${channel.device_id}`,
          ) || null,
          status: channel.status,
          raw_status: channel.raw_status,
          metadata: {
            protocol: channel.protocol,
            group_id: channel.group_id,
            group_name: channel.group_name,
            channel_type: channel.channel_type,
          },
          updated_by: input.updatedBy,
        });
        if (result.created) createdCount += 1;
        else updatedCount += 1;
      }
    }

    if (ezvizDeviceSerials.size > 0) {
      const channels = await ezvizDeviceService.listDeviceChannels();
      for (const channel of channels) {
        if (!ezvizDeviceSerials.has(channel.device_serial)) continue;

        const result = await tenantDeviceRepository.upsertSynced({
          tenant_id: input.tenantId,
          vendor: "ezviz",
          vendor_device_serial: channel.device_serial,
          vendor_device_name: channel.device_name,
          vendor_channel_id: null,
          vendor_channel_name: channel.channel_name,
          source_project_id: sourceProjectByDevice.get(`ezviz:${channel.device_serial}`) || null,
          status: channel.status,
          raw_status: channel.raw_status,
          metadata: {
            channel_no: channel.channel_no,
            video_encrypted: channel.video_encrypted,
            cover_url: channel.cover_url,
          },
          updated_by: input.updatedBy,
        });
        if (result.created) createdCount += 1;
        else updatedCount += 1;
      }
    }

    return {
      created_count: createdCount,
      updated_count: updatedCount,
      total_count: createdCount + updatedCount,
    };
  }

  private async getRequiredPlatformDevice(id: string, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const device = await tenantDeviceRepository.findById(id);
    if (!device) {
      throw Errors.badRequest("设备资产不存在");
    }

    return device;
  }

  private async getRequiredPlatformTencentDevice(id: string, authContext: AuthContext) {
    const device = await this.getRequiredPlatformDevice(id, authContext);
    if (device.vendor !== "tencent_iotvideo_industry") {
      throw Errors.badRequest("仅腾讯云设备支持该操作");
    }

    return device;
  }

  private getDeviceLabel(device: TenantDeviceRow) {
    return device.vendor_channel_name ||
      device.vendor_device_name ||
      device.vendor_channel_code ||
      device.vendor_device_code ||
      device.vendor_channel_id ||
      device.vendor_device_serial;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

export const tenantDeviceService = new TenantDeviceService();
