import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
  resolve(
    import.meta.dir,
    "../../app/(console)/douyin-miniapp/workspace/page.tsx",
  ),
  "utf8",
);
const loadingSource = readFileSync(
  resolve(
    import.meta.dir,
    "../../app/(console)/douyin-miniapp/workspace/loading.tsx",
  ),
  "utf8",
);

describe("Douyin miniapp workspace page contract", () => {
  test("keeps the loading state inside the shell scroll viewport", () => {
    expect(loadingSource).toContain("h-full");
    expect(loadingSource).toContain("[scrollbar-gutter:stable]");
    expect(loadingSource).toContain("overflow-y-auto");
  });

  test("uses only the tenant-scoped workspace endpoint", () => {
    expect(pageSource).toContain('"/tenant/douyin-miniapp/workspace"');
    expect(pageSource).not.toContain("/platform/douyin-miniapps");
  });

  test("does not fetch tenant data without read permission", () => {
    expect(pageSource).toContain('"douyin_miniapp.read"');
    expect(pageSource).toContain("canRead");
    expect(pageSource).toContain("canRead && token");
  });

  test("disables caching for operational status", () => {
    expect(pageSource).toContain('cache: "no-store"');
  });

  test("passes tenant-scoped manage, audit and publish permissions to workspace actions", () => {
    expect(pageSource).toContain('"douyin_miniapp.manage"');
    expect(pageSource).toContain('"douyin_miniapp.audit.submit"');
    expect(pageSource).toContain('"douyin_miniapp.publish"');
    expect(pageSource).toContain("canManage={canManage}");
    expect(pageSource).toContain("canSubmitAudit={canSubmitAudit}");
    expect(pageSource).toContain("canPublish={canPublish}");
  });
});
