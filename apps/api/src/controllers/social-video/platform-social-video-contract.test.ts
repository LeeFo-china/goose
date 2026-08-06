import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("平台自媒体脚本接口契约", () => {
  test("提供平台侧分页列表路由并使用平台读取权限", () => {
    const controller = readSource("./index.ts");
    const service = readSource("../../services/social-video-scripts/legacy-service.ts");
    const lists = readSource("../../services/social-video-scripts/legacy/lists.ts");
    const permissions = readSource("../../services/social-video-scripts/legacy/permissions.ts");

    expect(controller).toContain('@Get("/platform/social-video/scripts")');
    expect(controller).toContain("listPlatformScripts");
    expect(service).toContain("listPlatformScripts = listPlatformScripts");
    expect(lists).toContain("export async function listPlatformScripts");
    expect(lists).toContain("this.assertCanReadPlatformScripts(authContext)");
    expect(lists).toContain("tenantId: null");
    expect(permissions).toContain("assertCanReadPlatformScripts");
    expect(permissions).toContain("platform.usage.read");
  });
});
