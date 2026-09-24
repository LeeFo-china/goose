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

    expect(dialog).toContain("initialAsset?: TenantDeviceAsset");
    expect(dialog).toContain("/tenant-devices/${initialAsset.id}/tencent-access");
    expect(panel).toContain("asset.vendor_channel_id === null");
    expect(panel).toContain("projectId={asset.source_project_id || projectId || undefined}");
    expect(panel).toContain("initialAsset={asset}");
  });
});
