import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("GB28181 onboarding resume contract", () => {
  test("lets an unbound Tencent root asset resume with its saved project", () => {
    const dialog = readFileSync(
      new URL("./gb28181-onboarding-dialog.tsx", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("./tenant-device-assets-panel.tsx", import.meta.url),
      "utf8",
    );
    const picker = readFileSync(
      new URL("./gb28181-project-picker.tsx", import.meta.url),
      "utf8",
    );

    expect(dialog).toContain("initialAsset?: TenantDeviceAsset");
    expect(dialog).toContain("/tenant-devices/${initialAsset.id}/tencent-access");
    expect(panel).toContain("asset.vendor_channel_id === null");
    expect(panel).toContain('asset.device_type === "IPC"');
    expect(panel).toContain("projectId={asset.source_project_id || projectId || undefined}");
    expect(panel).toContain("initialAsset={asset}");
    expect(panel).toContain('<CreateCameraButton projectId="" devices={[]} />');
    expect(panel).toContain("加载更多设备");
    expect(panel).toContain("currentPage + 1");
    expect(picker).toContain("/projects/camera-bind-options?");
    expect(picker).toContain('pageSize: "20"');
  });
});
