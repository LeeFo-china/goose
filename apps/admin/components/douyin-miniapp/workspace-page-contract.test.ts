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

describe("Douyin miniapp workspace page contract", () => {
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

  test("passes tenant-scoped manage and audit permissions to workspace actions", () => {
    expect(pageSource).toContain('"douyin_miniapp.manage"');
    expect(pageSource).toContain('"douyin_miniapp.audit.submit"');
    expect(pageSource).toContain("canManage={canManage}");
    expect(pageSource).toContain("canSubmitAudit={canSubmitAudit}");
  });
});
