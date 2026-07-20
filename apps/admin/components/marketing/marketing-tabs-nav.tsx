"use client";

import Link from "next/link";
import { adminTabsListClassName, adminTabsTriggerWithBadgeClassName } from "@/components/admin/admin-tabs";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export type MarketingTabValue = "campaigns" | "h5" | "leads";

export function MarketingTabsNav({
  activeTab,
  hrefs,
  counts,
}: {
  activeTab: MarketingTabValue;
  hrefs: Record<MarketingTabValue, string>;
  counts: Record<MarketingTabValue, number>;
}) {
  return (
    <TabsList className={`${adminTabsListClassName} xl:w-auto`}>
      <TabsTrigger
        value="campaigns"
        asChild
        className={adminTabsTriggerWithBadgeClassName}
      >
        <Link href={hrefs.campaigns}>
          活动管理
          <Badge
            variant="outline"
            className="h-5 border-0 bg-transparent px-0 tabular-nums text-inherit"
          >
            {counts.campaigns}
          </Badge>
        </Link>
      </TabsTrigger>
      <TabsTrigger
        value="h5"
        asChild
        className={adminTabsTriggerWithBadgeClassName}
      >
        <Link href={hrefs.h5}>
          H5 活动页
          <Badge
            variant="outline"
            className="h-5 border-0 bg-transparent px-0 tabular-nums text-inherit"
          >
            {counts.h5}
          </Badge>
        </Link>
      </TabsTrigger>
      <TabsTrigger
        value="leads"
        asChild
        className={adminTabsTriggerWithBadgeClassName}
      >
        <Link href={hrefs.leads}>
          H5 线索
          <Badge
            variant="outline"
            className="h-5 border-0 bg-transparent px-0 tabular-nums text-inherit"
          >
            {counts.leads}
          </Badge>
        </Link>
      </TabsTrigger>
    </TabsList>
  );
}
