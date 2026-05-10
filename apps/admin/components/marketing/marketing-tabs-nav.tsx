"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const router = useRouter();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const href = hrefs[value as MarketingTabValue];
        if (href) {
          router.push(href);
        }
      }}
    >
      <TabsList className="h-auto w-full justify-start overflow-x-auto">
        <TabsTrigger value="campaigns" className="gap-2 whitespace-nowrap">
          活动管理
          <Badge variant={activeTab === "campaigns" ? "default" : "secondary"}>
            {counts.campaigns}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="h5" className="gap-2 whitespace-nowrap">
          H5 活动页
          <Badge variant={activeTab === "h5" ? "default" : "secondary"}>
            {counts.h5}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="leads" className="gap-2 whitespace-nowrap">
          H5 线索
          <Badge variant={activeTab === "leads" ? "default" : "secondary"}>
            {counts.leads}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
