import { describe, expect, test } from "bun:test";
import { Users } from "lucide-react";
import { getVisibleGroups, hasMenuItemAccess } from "./admin-nav-visibility";
import {
  tenantNavGroups,
  type AdminMenuGroup,
  type AdminMenuItem,
} from "./menu-config";
import type { AdminPermission, AdminSession } from "@/lib/backend";

function createSession(permissions: AdminPermission[]): AdminSession {
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

function findProjectRiskItem(): AdminMenuItem {
  const item = tenantNavGroups
    .flatMap((group) => group.items)
    .find((menuItem) => menuItem.href === "/project-health");

  if (!item) throw new Error("project risk menu item not found");

  return item;
}

describe("admin nav visibility", () => {
  test("shows project risk item when dashboard read and all-project read permissions exist", () => {
    const session = createSession([
      { code: "dashboard.read", scope: "all" },
      { code: "project.read", scope: "all" },
    ]);

    expect(hasMenuItemAccess(session, findProjectRiskItem())).toBe(true);
  });

  test.each(["self", "assigned", "department"] as const)(
    "hides project risk item when project read scope is %s",
    (scope) => {
      const session = createSession([
        { code: "dashboard.read", scope: "all" },
        { code: "project.read", scope },
      ]);

      expect(hasMenuItemAccess(session, findProjectRiskItem())).toBe(false);
    },
  );

  test("hides project risk item when dashboard read permission is missing", () => {
    const session = createSession([
      { code: "project.read", scope: "all" },
    ]);

    expect(hasMenuItemAccess(session, findProjectRiskItem())).toBe(false);
  });

  test("hides project risk item when project read permission is missing", () => {
    const session = createSession([
      { code: "dashboard.read", scope: "all" },
    ]);

    expect(hasMenuItemAccess(session, findProjectRiskItem())).toBe(false);
  });

  test("keeps legacy permission visible for any matching scope and hidden otherwise", () => {
    const item: AdminMenuItem = {
      href: "/wechat-rebind-requests",
      label: "微信换绑",
      icon: Users,
      permission: "customer.update",
    };

    expect(
      hasMenuItemAccess(
        createSession([{ code: "customer.update", scope: "self" }]),
        item,
      ),
    ).toBe(true);
    expect(
      hasMenuItemAccess(
        createSession([{ code: "customer.read", scope: "all" }]),
        item,
      ),
    ).toBe(false);
  });

  test("removes hidden items and empty groups from visible groups", () => {
    const groups: AdminMenuGroup[] = [
      {
        label: "可见分组",
        items: [
          { href: "/always", label: "始终可见", icon: Users },
          {
            href: "/customers",
            label: "客户",
            icon: Users,
            permission: "customer.update",
          },
        ],
      },
      {
        label: "空分组",
        items: [
          {
            href: "/project-health",
            label: "项目风险",
            icon: Users,
            requiredPermissions: [
              { code: "dashboard.read" },
              { code: "project.read", scope: "all" },
            ],
          },
        ],
      },
    ];

    const visibleGroups = getVisibleGroups(createSession([]), groups);

    expect(visibleGroups).toEqual([
      {
        label: "可见分组",
        items: [{ href: "/always", label: "始终可见", icon: Users }],
      },
    ]);
  });
});
