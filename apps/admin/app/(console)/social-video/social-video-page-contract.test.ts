import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readPageSource() {
  return readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
}

describe("自媒体脚本页面平台/租户接口分流", () => {
  test("平台超管会话读取平台脚本列表接口，租户会话保留租户接口", () => {
    const page = readPageSource();

    expect(page).toContain("getAdminSession");
    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("/platform/social-video/scripts");
    expect(page).toContain("/admin/social-video/scripts");
  });
});
