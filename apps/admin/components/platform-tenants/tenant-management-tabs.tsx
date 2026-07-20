import Link from "next/link";

import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminPermission } from "@/lib/backend";

export type TenantManagementTab =
  | "tenants"
  | "applications"
  | "publications";

export function TenantManagementTabs({
  activeTab,
  permissions,
  pageSize,
}: {
  activeTab: TenantManagementTab;
  permissions: readonly AdminPermission[];
  pageSize?: number;
}) {
  const canReviewApplications = permissions.some(
    ({ code }) => code === "platform.tenant_onboarding.review",
  );
  const canPublishProfiles = permissions.some(
    ({ code }) => code === "platform.service_provider.publish",
  );
  const pageSizeQuery = pageSize ? `&pageSize=${pageSize}` : "";
  const tenantPageSizeQuery = pageSize ? `?pageSize=${pageSize}` : "";
  const activeLabel = {
    tenants: "租户列表",
    applications: "入驻申请",
    publications: "公开发布",
  }[activeTab];

  return (
    <TabsList
      aria-label={`租户管理页签，当前${activeLabel}`}
      className={platformTabsListClassName}
    >
      <TabsTrigger
        value="tenants"
        asChild
        className={platformTabsTriggerClassName}
      >
        <Link href={`/platform/tenants${tenantPageSizeQuery}`}>租户列表</Link>
      </TabsTrigger>
      {canReviewApplications ? (
        <TabsTrigger
          value="applications"
          asChild
          className={platformTabsTriggerClassName}
        >
          <Link
            href={`/platform/tenant-onboarding?tab=applications${pageSizeQuery}`}
          >
            入驻申请
          </Link>
        </TabsTrigger>
      ) : null}
      {canPublishProfiles ? (
        <TabsTrigger
          value="publications"
          asChild
          className={platformTabsTriggerClassName}
        >
          <Link
            href={`/platform/tenant-onboarding?tab=publications${pageSizeQuery}`}
          >
            公开发布
          </Link>
        </TabsTrigger>
      ) : null}
    </TabsList>
  );
}
