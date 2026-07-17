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
});
