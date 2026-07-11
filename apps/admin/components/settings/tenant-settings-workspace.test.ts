import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("tenant settings workspace", () => {
  test("renders a dedicated workspace only for tenant mode", () => {
    const pageSource = readSource("../../app/(console)/settings/page.tsx");

    expect(pageSource).toContain("TenantSettingsWorkspace");
    expect(pageSource).toContain("TenantSettingsHeader");
    expect(pageSource).toContain("PlatformSettingsHeader");
    expect(pageSource).toContain("isPlatformMode ?");
  });

  test("uses operational tenant copy and a flat responsive workspace", () => {
    const headerSource = readSource("./settings-page-header.tsx");
    const workspaceSource = readSource("./tenant-settings-workspace.tsx");

    expect(headerSource).toContain("管理本租户使用的短信服务和客服入口");
    expect(headerSource).toContain("配置已就绪");
    expect(workspaceSource).toContain("短信配置");
    expect(workspaceSource).toContain("客服配置");
    expect(workspaceSource).toContain('aria-label="租户系统配置分组"');
    expect(workspaceSource).toContain("lg:grid-cols-[14rem_minmax(0,1fr)]");
    expect(workspaceSource).toContain("TenantSmsSettingsPanel");
    expect(workspaceSource).not.toContain("PlatformPaymentSettingsPanel");
    expect(workspaceSource).not.toContain("SocialVideoTranscriptionTester");
    expect(workspaceSource).not.toContain("TencentLbsConfigTester");
  });

  test("progressively discloses tenant SMS provider settings", () => {
    const source = [
      readSource("./tenant-sms-settings-panel.tsx"),
      readSource("./tenant-settings-status.ts"),
    ].join("\n");

    expect(source).toContain("继承平台短信通道");
    expect(source).toContain("自有阿里云短信通道");
    expect(source).toContain("自有腾讯云短信通道");
    expect(source).toContain('updateSetting("SMS_CHANNEL_MODE", nextMode)');
    expect(source).toContain("aliyunSmsKeys.has(setting.key)");
    expect(source).toContain("tencentSmsKeys.has(setting.key)");
    expect(source).toContain("SelectGroup");
    expect(source).toContain('mode === "platform"');
    expect(source).toContain("SettingEditor");
  });

  test("keeps the route loading skeleton aligned with the tenant workspace", () => {
    const source = readSource("../../app/(console)/settings/loading.tsx");

    expect(source).toContain("lg:grid-cols-[14rem_minmax(0,1fr)]");
    expect(source).toContain("bg-muted/25");
    expect(source).toContain("Array.from({ length: 2 })");
    expect(source).not.toContain("Array.from({ length: 5 })");
  });

  test("counts only settings required by the active tenant SMS channel", () => {
    const pageSource = readSource("../../app/(console)/settings/page.tsx");

    expect(pageSource).toContain("countTenantGroupMissing");
    expect(pageSource).toContain(
      "countTenantGroupMissing(groupCode, settings)",
    );
  });
});
