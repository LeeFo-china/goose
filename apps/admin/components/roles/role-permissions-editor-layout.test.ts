import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readEditorSource() {
  return readFileSync(
    new URL("./role-permissions-editor.tsx", import.meta.url),
    "utf8",
  );
}

function readTreeViewSource() {
  return readFileSync(
    new URL("./role-permission-tree-view.tsx", import.meta.url),
    "utf8",
  );
}

describe("role permissions editor layout", () => {
  test("renders permissions as business categories instead of technical module tabs", () => {
    const editor = readEditorSource();
    const treeView = readTreeViewSource();

    expect(editor).toContain("buildPermissionTree");
    expect(editor).toContain("loadActivePermissions");
    expect(editor).toContain("ACTIVE_PERMISSION_PAGE_SIZE = 100");
    expect(editor).toContain("<RolePermissionTreeView");
    expect(editor).toContain("展开全部");
    expect(editor).toContain("收起全部");
    expect(editor).toContain("撤销变更");
    expect(editor).toContain("本次变更");
    expect(editor).toContain("getPermissionGroup");
    expect(editor).toContain("全部分类");
    expect(editor).not.toContain("全部模块");
    expect(editor).not.toContain("const module = permission.module ||");
    expect(editor).not.toContain("const moduleKey = permission.module ||");
    expect(editor).not.toContain("groupedPermissions = visiblePermissions.reduce");
    expect(editor).not.toContain("全选本组");
    expect(editor).not.toContain("pageSize=200");

    expect(treeView).toContain("@/components/ui/collapsible");
    expect(treeView).toContain("@/components/ui/select");
    expect(treeView).toContain("permissionTree.map");
    expect(treeView).toContain("moduleGroup.resources.map");
    expect(treeView).toContain("getPermissionGroupCheckState");
    expect(treeView).toContain('state === "indeterminate" ? "indeterminate"');
    expect(treeView).toContain("pl-12");
    expect(treeView).toContain("md:grid-cols-[1fr_160px]");
    expect(treeView).not.toContain("pl-16");
    expect(treeView).not.toContain("md:grid-cols-[1fr_180px]");
  });
});
