import { describe, expect, test } from "bun:test";
import { tenantNavGroups } from "./menu-config";
import { isActivePath } from "./admin-nav-utils";

describe("admin nav active matching", () => {
  test("keeps exact nav items inactive on nested routes", () => {
    expect(isActivePath("/finance", "/finance", { exact: true })).toBe(true);
    expect(isActivePath("/finance/ledger", "/finance", { exact: true })).toBe(
      false,
    );
  });

  test("keeps prefix matching for section nav items by default", () => {
    expect(isActivePath("/projects/project-1", "/projects")).toBe(true);
    expect(isActivePath("/projects/health", "/projects")).toBe(true);
  });

  test("supports route aliases for one consolidated nav item", () => {
    const options = { activeHrefs: ["/platform/tenant-onboarding"] };

    expect(isActivePath("/platform/tenants", "/platform/tenants", options)).toBe(
      true,
    );
    expect(
      isActivePath("/platform/tenant-onboarding", "/platform/tenants", options),
    ).toBe(true);
    expect(
      isActivePath(
        "/platform/tenant-onboarding/application-1",
        "/platform/tenants",
        options,
      ),
    ).toBe(true);
  });

  test("keeps tenant settings inactive on service provider profile route", () => {
    const systemItems = tenantNavGroups.find((group) => group.label === "系统")
      ?.items ?? [];
    const activeLabels = systemItems
      .filter((item) =>
        isActivePath("/settings/service-provider", item.href, {
          exact: item.activeMatch === "exact",
        })
      )
      .map((item) => item.label);

    expect(activeLabels).toEqual(["服务商资料"]);
  });

  test("matches each Douyin miniapp workspace route inside its own section", () => {
    const douyinItems = tenantNavGroups.find(
      (group) => group.label === "抖音小程序",
    )?.items ?? [];

    expect(douyinItems).toHaveLength(2);
    expect(
      isActivePath(
        "/douyin-miniapp/workspace",
        douyinItems[0]?.href ?? "",
      ),
    ).toBe(true);
    expect(
      isActivePath(
        "/douyin-miniapp/projects",
        douyinItems[1]?.href ?? "",
      ),
    ).toBe(true);
    expect(
      isActivePath(
        "/douyin-miniapp/projects",
        douyinItems[0]?.href ?? "",
      ),
    ).toBe(false);
  });
});
