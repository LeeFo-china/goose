import { describe, expect, test } from "bun:test";
import { Users } from "lucide-react";
import { getVisibleGroups, hasMenuItemAccess } from "./admin-nav-visibility";
import {
  platformNavGroups,
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

function createPlatformSuperAdminSession(): AdminSession {
  return {
    ...createSession([]),
    tenant: null,
    roles: ["platform_admin"],
    is_platform_staff: true,
    is_platform_super_admin: true,
  };
}

describe("admin nav visibility", () => {
  test("shows tenant supplier catalog only with catalog management permission", () => {
    const purchasing = tenantNavGroups.find((group) =>
      group.label === "采购供应"
    );
    const item = purchasing?.items.find((candidate) =>
      candidate.href === "/supplier-catalog"
    );

    expect(item?.label).toBe("供应商目录");
    expect(item?.permission).toBe("supplier.catalog.manage");
    expect(hasMenuItemAccess(createSession([]), item!)).toBe(false);
    expect(hasMenuItemAccess(createSession([{
      code: "supplier.catalog.manage",
      scope: "all",
    }]), item!)).toBe(true);
  });

  test("registers Douyin publishing with the platform management permission", () => {
    const item = platformNavGroups.flatMap((group) => group.items).find(
      (candidate) => candidate.href === "/platform/douyin-miniapps",
    );

    expect(item?.label).toBe("抖音模板");
    expect(item?.requiredPermissions).toEqual([{
      code: "platform.douyin_miniapp.manage",
      scope: "all",
    }]);
    expect(item?.allowPlatformAdminPermissionBypass).toBe(false);
    expect(hasMenuItemAccess(createSession([{
      code: "platform.douyin_miniapp.manage",
      scope: "self",
    }]), item!)).toBe(false);
    expect(hasMenuItemAccess(createPlatformSuperAdminSession(), item!)).toBe(false);
  });

  test("consolidates tenant operations into one platform nav item", () => {
    const platformItems = platformNavGroups.flatMap((group) => group.items);
    const tenantManagementItem = platformItems.find(
      (item) => item.href === "/platform/tenants",
    );

    expect(tenantManagementItem?.label).toBe("租户管理");
    expect(tenantManagementItem?.activeHrefs).toEqual([
      "/platform/tenant-onboarding",
    ]);
    expect(tenantManagementItem?.permission).toBeUndefined();
    expect(platformItems.some((item) => item.label === "服务商入驻")).toBe(false);
  });

  test("shows branding addon management only with the product permission", () => {
    const brandingItem = platformNavGroups
      .flatMap((group) => group.items)
      .find((item) => item.href === "/platform/branding-addon");

    expect(brandingItem?.label).toBe("品牌权益");
    expect(brandingItem?.permission).toBe(
      "platform.branding_product.manage",
    );
    expect(
      hasMenuItemAccess(
        createSession([
          {
            code: "platform.branding_product.manage",
            scope: "all",
          },
        ]),
        brandingItem!,
      ),
    ).toBe(true);
    expect(hasMenuItemAccess(createSession([]), brandingItem!)).toBe(false);
  });

  test("shows platform branding separately with the platform branding permission", () => {
    const platformItems = platformNavGroups.flatMap((group) => group.items);
    const brandingItem = platformItems.find(
      (item) => item.href === "/platform/branding",
    );
    const addonItem = platformItems.find(
      (item) => item.href === "/platform/branding-addon",
    );

    expect(brandingItem?.label).toBe("平台品牌");
    expect(brandingItem?.permission).toBe("platform.branding.manage");
    expect(addonItem?.label).toBe("品牌权益");
    expect(addonItem?.permission).toBe("platform.branding_product.manage");
    expect(
      hasMenuItemAccess(
        createSession([
          {
            code: "platform.branding.manage",
            scope: "all",
          },
        ]),
        brandingItem!,
      ),
    ).toBe(true);
    expect(hasMenuItemAccess(createSession([]), brandingItem!)).toBe(false);
  });

  test("keeps project list and risk under one tenant project nav item", () => {
    const businessItems = tenantNavGroups.find((group) => group.label === "业务")
      ?.items ?? [];
    const projectItem = businessItems.find((item) => item.href === "/projects");

    expect(projectItem?.label).toBe("项目");
    expect(projectItem?.requiredPermissions).toBeUndefined();
    expect(projectItem?.permission).toBeUndefined();
    expect(businessItems.some((item) => item.href === "/project-health")).toBe(false);
    expect(businessItems.some((item) => item.label === "项目风险")).toBe(false);
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

  test("keeps platform super admin from being locked out by stale platform permission lists", () => {
    const item: AdminMenuItem = {
      href: "/platform/operators",
      label: "平台人员",
      icon: Users,
      permission: "platform.operator.read",
    };

    expect(hasMenuItemAccess(createPlatformSuperAdminSession(), item)).toBe(true);
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
            href: "/projects/health",
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

  test("shows the Douyin miniapp group only with tenant read permission", () => {
    const withoutPermission = getVisibleGroups(
      createSession([]),
      tenantNavGroups,
    );
    const withPermission = getVisibleGroups(
      createSession([{ code: "douyin_miniapp.read", scope: "all" }]),
      tenantNavGroups,
    );

    expect(
      withoutPermission.some((group) => group.label === "抖音小程序"),
    ).toBe(false);
    expect(
      withPermission.find((group) => group.label === "抖音小程序")?.items
        .map((item) => item.label),
    ).toEqual(["小程序工作台"]);
  });
});
