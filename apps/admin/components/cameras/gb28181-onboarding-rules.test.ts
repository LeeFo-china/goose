import { describe, expect, test } from "bun:test";
import type { TenantDeviceAsset } from "@/components/cameras/camera-types";
import {
  buildGb28181CameraPayload,
  decideGb28181Assets,
  decideGb28181Channel,
  findGb28181Channels,
  getNextTenantDevicePage,
  type Gb28181ChannelAsset,
} from "@/components/cameras/gb28181-onboarding-rules";

function asset(overrides: Partial<TenantDeviceAsset>): TenantDeviceAsset {
  return {
    id: "asset-1",
    tenant_id: "tenant-1",
    vendor: "tencent_iotvideo_industry",
    vendor_device_serial: "device-1",
    vendor_device_code: "34020000001320000001",
    vendor_device_name: "客厅",
    vendor_channel_id: "channel-1",
    vendor_channel_code: "34020000001320000002",
    vendor_channel_name: "客厅",
    device_type: "IPC",
    source_project_id: "project-1",
    bound_project_id: null,
    bound_camera_id: null,
    status: "online",
    raw_status: "1",
    metadata: null,
    created_at: "2026-09-24T00:00:00.000Z",
    updated_at: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function channelAsset(
  overrides: Partial<Gb28181ChannelAsset>,
): Gb28181ChannelAsset {
  return asset(overrides) as Gb28181ChannelAsset;
}

describe("GB28181 onboarding rules", () => {
  test("builds a safe project camera payload from one name", () => {
    expect(buildGb28181CameraPayload({
      name: "  客厅  ",
      deviceId: "device-1",
      channelId: "channel-1",
      deviceCode: "device-code",
      channelCode: "channel-code",
    })).toEqual({
      name: "客厅",
      position: null,
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: "device-1",
      vendor_channel_id: "channel-1",
      vendor_device_code: "device-code",
      vendor_channel_code: "channel-code",
      channel_no: 1,
      can_view: true,
      can_control: false,
      capabilities: ["live"],
      cover_url: null,
      sort_order: 0,
      remark: null,
      video_encrypted: false,
      play_protocol: "flv",
    });
  });

  test("returns only unbound channels for the device created in this flow", () => {
    const matches = findGb28181Channels([
      asset({ id: "device-only", vendor_channel_id: null }),
      asset({ id: "other-device", vendor_device_serial: "device-2" }),
      asset({ id: "bound", vendor_channel_id: "channel-2", bound_camera_id: "camera-1" }),
      asset({ id: "wanted", vendor_channel_id: "channel-3" }),
      asset({ id: "ezviz", vendor: "ezviz", vendor_device_serial: "device-1" }),
    ], "device-1");

    expect(matches.map((item) => item.id)).toEqual(["wanted"]);
  });

  test("automatically selects one channel and asks when several are available", () => {
    const first = channelAsset({ id: "first", vendor_channel_id: "channel-1" });
    const second = channelAsset({ id: "second", vendor_channel_id: "channel-2" });

    expect(decideGb28181Channel([])).toEqual({ kind: "not-found" });
    expect(decideGb28181Channel([first])).toEqual({ kind: "selected", channel: first });
    expect(decideGb28181Channel([first, second])).toEqual({
      kind: "choose",
      channels: [first, second],
    });
  });

  test("continues paginated asset lookup until the final page", () => {
    expect(getNextTenantDevicePage({ page: 1, pageSize: 100, total: 205, totalPages: 3 }))
      .toBe(2);
    expect(getNextTenantDevicePage({ page: 3, pageSize: 100, total: 205, totalPages: 3 }))
      .toBeNull();
    expect(getNextTenantDevicePage(undefined)).toBeNull();
  });

  test("treats a device already bound to the current project as completed", () => {
    const bound = asset({
      id: "bound",
      bound_project_id: "project-1",
      bound_camera_id: "camera-1",
    });

    expect(decideGb28181Assets([bound], "device-1", "project-1"))
      .toEqual({ kind: "already-bound", asset: bound });
  });

  test("blocks a device already bound to another project", () => {
    const bound = asset({
      id: "bound-elsewhere",
      bound_project_id: "project-2",
      bound_camera_id: "camera-2",
    });

    expect(decideGb28181Assets([bound], "device-1", "project-1"))
      .toEqual({ kind: "bound-elsewhere", asset: bound });
  });
});
