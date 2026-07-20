"use client";

import type { ComponentPropsWithoutRef } from "react";
import { adminTabsListClassName, adminTabsTriggerClassName } from "@/components/admin/admin-tabs";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function OpsTabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        adminTabsListClassName,
        className,
      )}
      {...props}
    />
  );
}

export function OpsTabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(adminTabsTriggerClassName, className)}
      {...props}
    />
  );
}
