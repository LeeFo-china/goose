"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlatformDevicesTabValue } from "@/components/platform-devices/platform-device-types";

export function PlatformDeviceTabsNav({
  activeTab,
  hrefs,
  counts,
}: {
  activeTab: PlatformDevicesTabValue;
  hrefs: Record<PlatformDevicesTabValue, string>;
  counts?: Partial<Record<PlatformDevicesTabValue, number>>;
}) {
  return (
    <TabsList className="h-auto w-full justify-start overflow-x-auto">
      <TabsTrigger value="ownership" asChild className="gap-2 whitespace-nowrap">
        <Link href={hrefs.ownership}>
          资产归属
          {typeof counts?.ownership === "number" ? (
            <Badge variant={activeTab === "ownership" ? "default" : "secondary"}>
              {counts.ownership}
            </Badge>
          ) : null}
        </Link>
      </TabsTrigger>
      <TabsTrigger value="tencent" asChild className="gap-2 whitespace-nowrap">
        <Link href={hrefs.tencent}>
          腾讯云设备
          {typeof counts?.tencent === "number" ? (
            <Badge variant={activeTab === "tencent" ? "default" : "secondary"}>
              {counts.tencent}
            </Badge>
          ) : null}
        </Link>
      </TabsTrigger>
    </TabsList>
  );
}
