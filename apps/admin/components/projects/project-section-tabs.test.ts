import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canViewProjectHealth,
  projectSectionTabs,
} from "./project-section-tabs";
import type { AdminSession } from "@/lib/backend";

function createSession(
  permissions: AdminSession["permissions"],
): AdminSession {
  return {
    user_id: "user-1",
    login_channel: "admin_web",
    employee: {
      id: "employee-1",
      name: "测试员工",
      status: "active",
      tenant_department_id: null,
      department_name: null,
      post_id: null,
      post_name: null,
      avatar: null,
    },
    tenant: {
      id: "tenant-1",
      name: "测试租户",
      slug: "test",
      status: "active",
    },
    roles: [],
    permissions,
  };
}

describe("project section tabs", () => {
  test("links project list and risk under the project section", () => {
    expect(projectSectionTabs).toEqual([
      { key: "list", label: "项目列表", href: "/projects" },
      { key: "health", label: "项目风险", href: "/projects/health" },
    ]);
  });

  test("uses local shadcn tabs for the project section nav", () => {
    const source = readFileSync(
      new URL("./project-section-tabs.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('from "@/components/ui/tabs"');
    expect(source).toContain("<Tabs");
    expect(source).toContain("<TabsList");
    expect(source).toContain("<TabsTrigger");
  });

  test("requires dashboard read and all-project read to view project risk", () => {
    expect(
      canViewProjectHealth(createSession([
        { code: "dashboard.read", scope: "all" },
        { code: "project.read", scope: "all" },
      ])),
    ).toBe(true);
    expect(
      canViewProjectHealth(createSession([
        { code: "dashboard.read", scope: "all" },
        { code: "project.read", scope: "department" },
      ])),
    ).toBe(false);
    expect(
      canViewProjectHealth(createSession([
        { code: "project.read", scope: "all" },
      ])),
    ).toBe(false);
  });
});
