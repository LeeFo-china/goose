import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("tenant service provider settings workspace", () => {
  test("exposes publication gates and tenant navigation contract", () => {
    const pageSource = readSource(
      "../../app/(console)/settings/service-provider/page.tsx",
    );
    const workspaceSource = readSource("./service-provider-workspace.tsx");
    const actionsSource = readSource("./service-provider-actions.tsx");
    const menuSource = readSource("../layout/menu-config.ts");

    expect(pageSource).toContain("/tenant/service-provider-profile");
    expect(pageSource).toContain("/tenant/service-provider-areas");
    expect(workspaceSource).toContain("提交平台发布审核");
    expect(workspaceSource).toContain("当前资料状态");
    expect(actionsSource).toContain("service_provider.profile.manage");
    expect(menuSource).toContain('href: "/settings/service-provider"');
  });

  test("does not imply onboarding approval means immediate public display", () => {
    const workspaceSource = readSource("./service-provider-workspace.tsx");

    expect(workspaceSource).not.toContain("入驻成功即展示");
  });
});
