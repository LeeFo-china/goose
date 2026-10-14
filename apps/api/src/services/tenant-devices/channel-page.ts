import { Errors } from "@/errors/error-factory";
import { tenantDeviceChannelGateway } from "@/gateways/tencent-iot-video/channel-page";
import { tenantDeviceChannelRepository } from "@/repositories/tenant-devices/channel-page";
import { tenantDeviceRepository } from "@/repositories/tenant-devices";
import { waitForSignal } from "@/utils/abortable-wait";
import type { AuthContext } from "@/services/authorization";
import { assertTenantDeviceAccess } from "./legacy/access";

type ChannelInput = { authContext: AuthContext; id: string; query: { page: number; pageSize: number } };
const TIMEOUT_MS = 10_000;
async function resolveDevice(input: ChannelInput, permission: string, signal: AbortSignal) {
  const tenantId = assertTenantDeviceAccess(input.authContext, permission);
  const device = await waitForSignal(tenantDeviceRepository.findById(input.id, tenantId), signal);
  if (!device) throw Errors.business(404, "设备资产不存在", "CAMERA_NOT_FOUND");
  if (device.vendor !== "tencent_iotvideo_industry") throw Errors.badRequest("仅腾讯云设备支持该操作");
  return device;
}

export async function listTenantDeviceChannels(input: ChannelInput) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const device = await resolveDevice(input, "project.read", signal);
  return waitForSignal(tenantDeviceChannelRepository.list(device, input.query, signal), signal);
}

export async function syncTenantDevicePage(input: ChannelInput) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const device = await resolveDevice(input, "project.update", signal);
  const employeeId = input.authContext.employeeId;
  if (!employeeId) throw Errors.forbidden();
  const checkedAt = new Date().toISOString();
  const result = await tenantDeviceChannelGateway.readPage(device.vendor_device_serial, input.query, signal);
  const saved = await waitForSignal(tenantDeviceChannelRepository.sync({
    tenantId: device.tenant_id, assetId: device.id, employeeId,
    channels: result.channels, checkedAt, signal,
  }), signal);
  return { ...saved, device_id: device.vendor_device_serial,
    sync: { ...input.query, total: result.total, has_more: result.hasMore,
      next_page: result.hasMore ? input.query.page + 1 : null,
      state: result.hasMore ? "partial" : result.channels.length === 0 && input.query.page === 1
        ? "waiting_for_device" : "complete" } };
}
