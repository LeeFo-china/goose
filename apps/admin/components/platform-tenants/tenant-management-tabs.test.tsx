import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Tabs } from "@/components/ui/tabs";
import { TenantManagementTabs } from "./tenant-management-tabs";

describe("TenantManagementTabs", () => {
  test("shows platform workflow tabs to a super admin without explicit permission rows", () => {
    const html = renderToStaticMarkup(
      <Tabs value="tenants">
        <TenantManagementTabs
          activeTab="tenants"
          permissions={[]}
          isPlatformSuperAdmin
        />
      </Tabs>,
    );

    expect(html).toContain("入驻申请");
    expect(html).toContain("公开发布");
  });
});
