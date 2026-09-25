import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildCreateCameraPayload } from "@/components/cameras/camera-form-submit";
import { canBindCameraToProject } from "@/components/cameras/camera-mutation-shared";
import { collapseTenantDeviceAssets, getBoundProjectLabel, getDevicePreviewDisabledReason } from "@/components/cameras/tenant-device-asset-utils";
import type { CameraDeviceChannel } from "@/components/cameras/camera-types";

describe("camera asset binding payload", () => {
  test("submits the selected tenant device id with the project alias", () => {
    const device: CameraDeviceChannel = {
      vendor: "tencent_iotvideo_industry",
      tenant_device_id: "11111111-1111-4111-8111-111111111111",
      device_id: "device-1",
      device_code: "device-code",
      device_name: "DS-ABC123",
      channel_id: "channel-1",
      channel_code: "channel-code",
      channel_name: "主码流",
      device_type: 2,
      channel_type: 1,
      status: "online",
      raw_status: null,
      protocol: "GB28181",
      group_id: null,
      group_name: null,
      is_bound: false,
      is_bound_to_current_project: false,
      bound_project_id: null,
      bound_project_name: null,
      bound_camera_id: null,
      bound_camera_name: null,
      can_bind: true,
    };

    const payload = buildCreateCameraPayload({
      name: "客厅",
      position: "",
      vendor: "tencent_iotvideo_industry",
      device_key: "tencent_iotvideo_industry::device-1::channel-1",
      play_protocol: "flv",
      can_view: "true",
      can_control: "false",
      capabilities: ["live"],
      cover_url: "",
      sort_order: "0",
      remark: "",
      video_encrypted: "false",
    }, [device]);

    expect(payload).toMatchObject({
      tenant_device_id: "11111111-1111-4111-8111-111111111111",
      name: "客厅",
    });
  });

  test("shows one IPC channel instead of a duplicate root asset", () => {
    const root = {
      id: "root",
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: "device-1",
      vendor_channel_id: null,
    } as never;
    const channel = {
      id: "channel",
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: "device-1",
      vendor_channel_id: "channel-1",
    } as never;

    expect(collapseTenantDeviceAssets([root, channel])).toEqual([channel]);
  });

  test("uses the bound project address and otherwise says unbound", () => {
    expect(getBoundProjectLabel({
      bound_project_id: "project-1",
      bound_project: { id: "project-1", name: "项目一", address: "昌明花园" },
      bound_camera: { id: "camera-1", name: "客厅" },
    } as never)).toBe("昌明花园 · 客厅");
    expect(getBoundProjectLabel({
      bound_project_id: "project-1",
      bound_project: { id: "project-1", name: "项目一", address: "昌明花园" },
    } as never)).toBe("昌明花园");
    expect(getBoundProjectLabel({ bound_project_id: null } as never)).toBe("未绑定");
  });

  test("does not allow binding until the target project has loaded", () => {
    expect(canBindCameraToProject(null)).toBe(false);
    expect(canBindCameraToProject({ id: "project-1", name: "项目一" })).toBe(true);
    expect(canBindCameraToProject({ id: "project-2", name: "项目二", status: "acceptance" })).toBe(false);
  });

  test("allows previewing both connected Tencent channels and Ezviz assets", () => {
    expect(getDevicePreviewDisabledReason({
      vendor: "tencent_iotvideo_industry",
      vendor_channel_id: "channel-1",
      status: "online",
    } as never)).toBe("");
    expect(getDevicePreviewDisabledReason({
      vendor: "ezviz",
      vendor_channel_id: null,
      status: "online",
    } as never)).toBe("");
    expect(getDevicePreviewDisabledReason({
      vendor: "tencent_iotvideo_industry",
      vendor_channel_id: null,
      status: "unknown",
    } as never)).toBe("设备尚未完成接入");
  });

  test("keeps registration, preview and access information in device management", () => {
    const panel = readFileSync(new URL("./tenant-device-assets-panel.tsx", import.meta.url), "utf8");
    const create = readFileSync(new URL("./tenant-device-create-dialog.tsx", import.meta.url), "utf8");

    expect(panel).toContain("TenantDeviceCreateDialog");
    expect(panel).toContain("TenantDevicePreviewAction");
    expect(panel).toContain("getBoundProjectLabel(asset)");
    expect(create).toContain('hardware_serial: hardwareSerial');
    expect(create).toContain('requestBackendJson("/tenant-devices/tencent"');
  });

  test("requires the operator to explicitly select a device asset", () => {
    const dialog = readFileSync(new URL("./camera-form-dialog.tsx", import.meta.url), "utf8");

    expect(dialog).not.toContain('form.setValue("device_key", nextKeys[nextVendor]');
    expect(dialog).toContain('device_key: ""');
  });
});
