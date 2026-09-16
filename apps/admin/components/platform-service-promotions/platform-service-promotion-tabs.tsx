"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { platformTabsListClassName, platformTabsTriggerClassName } from "@/components/platform/platform-tabs";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PlatformServicePromotionTabsNav({ pageSize, canManagePromotions }: { pageSize: number; canManagePromotions: boolean }) {
  function handleLinkKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    // Radix handles arrow focus; anchors need explicit Space activation.
    if (event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <TabsList className={platformTabsListClassName} aria-label="技术服务配置">
      <TabsTrigger value="products" asChild className={platformTabsTriggerClassName}>
        <Link href={`/platform/service-products?tab=products&page=1&pageSize=${pageSize}`} onKeyDown={handleLinkKeyDown}>套餐</Link>
      </TabsTrigger>
      {canManagePromotions ? <TabsTrigger value="promotions" asChild className={platformTabsTriggerClassName}>
        <Link href={`/platform/service-products?tab=promotions&page=1&pageSize=${pageSize}`} onKeyDown={handleLinkKeyDown}>限时活动</Link>
      </TabsTrigger> : null}
    </TabsList>
  );
}
