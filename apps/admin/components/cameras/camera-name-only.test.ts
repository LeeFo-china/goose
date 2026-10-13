import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildCreateCameraPayload } from "./camera-form-submit";
import { buildDefaults, CameraFormSchema } from "./camera-mutation-shared";

describe("camera naming contract", () => {
  test("requires a project alias and preserves hardware identity when it changes", () => {
    const values = { ...buildDefaults(), name: "  客厅施工位  ", device_key: "ezviz::SN-123::1" };
    expect(CameraFormSchema.safeParse({ ...values, name: "  " }).success).toBe(false);
    const original = buildCreateCameraPayload(values, []);
    const renamed = buildCreateCameraPayload({ ...values, name: "入户门" }, []);
    expect(original.name).toBe("客厅施工位");
    expect(renamed.name).toBe("入户门");
    expect(original.vendor_device_serial).toBe("SN-123");
    expect(renamed.vendor_device_serial).toBe(original.vendor_device_serial);
    expect(renamed.channel_no).toBe(original.channel_no);
  });
  test("uses a project-local alias as the single editable location label", () => {
    const fields = readFileSync(
      new URL("./camera-settings-fields.tsx", import.meta.url),
      "utf8",
    );
    const mutations = readFileSync(
      new URL("./camera-mutations.tsx", import.meta.url),
      "utf8",
    );
    const dialog = readFileSync(
      new URL("./camera-form-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(fields).toMatch(/name="name"[\s\S]*?<FieldLabel htmlFor="camera-name">项目内别名<\/FieldLabel>/);
    expect(fields).toContain("不会修改设备 SN");
    expect(fields).not.toContain('name="vendor_device_serial"');
    expect(fields).not.toContain(">安装位置</FieldLabel>");
    expect(fields).not.toContain('name="position"');
    expect(fields).toContain("showAdvanced: boolean");
    expect(fields).toContain("{showAdvanced ? (");
    expect(fields).toContain("CollapsibleContent");
    expect(mutations).toContain("advanced");
    expect(dialog).toContain('pageSize: "20"');
    expect(dialog).toContain("deviceKeyword.trim()");
    expect(dialog).toContain("loadMoreDevices");
  });
});
