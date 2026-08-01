"use client";

import { type ReactNode, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BrandingView = "product" | "orders" | "refunds";

const viewHrefs: Record<BrandingView, string> = {
  product: "/platform/branding-addon",
  orders: "/platform/branding-addon?view=orders",
  refunds: "/platform/branding-addon?view=refunds",
};

export function PlatformBrandingAdminTabs({
  value,
  canManage,
  canReadOrders,
  canManageRefunds,
  children,
}: {
  value: BrandingView;
  canManage: boolean;
  canReadOrders: boolean;
  canManageRefunds: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        startTransition(() => router.push(viewHrefs[nextValue as BrandingView]));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className={platformTabsListClassName} aria-busy={pending}>
        {canManage ? (
          <TabsTrigger
            value="product"
            className={platformTabsTriggerClassName}
            disabled={pending}
          >
            商品与支付通道
          </TabsTrigger>
        ) : null}
        {canReadOrders ? (
          <TabsTrigger
            value="orders"
            className={platformTabsTriggerClassName}
            disabled={pending}
          >
            购买订单
          </TabsTrigger>
        ) : null}
        {canManageRefunds ? (
          <TabsTrigger
            value="refunds"
            className={platformTabsTriggerClassName}
            disabled={pending}
          >
            退款处理
          </TabsTrigger>
        ) : null}
      </TabsList>
      {children}
    </Tabs>
  );
}
