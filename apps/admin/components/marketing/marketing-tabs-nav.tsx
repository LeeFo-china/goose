"use client";

import Link from "next/link";
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
    <TabsList className="h-auto w-full justify-start overflow-x-auto">
      <TabsTrigger value="campaigns" asChild className="gap-2 whitespace-nowrap">
        <Link href={hrefs.campaigns}>
          活动管理
          <Badge variant={activeTab === "campaigns" ? "default" : "secondary"}>
            {counts.campaigns}
          </Badge>
        </Link>
      </TabsTrigger>
      <TabsTrigger value="h5" asChild className="gap-2 whitespace-nowrap">
        <Link href={hrefs.h5}>
          H5 活动页
          <Badge variant={activeTab === "h5" ? "default" : "secondary"}>
            {counts.h5}
          </Badge>
        </Link>
      </TabsTrigger>
      <TabsTrigger value="leads" asChild className="gap-2 whitespace-nowrap">
        <Link href={hrefs.leads}>
          H5 线索
          <Badge variant={activeTab === "leads" ? "default" : "secondary"}>
            {counts.leads}
          </Badge>
        </Link>
      </TabsTrigger>
    </TabsList>
  );
}
