"use client";

import type { ComponentPropsWithoutRef } from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function OpsTabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "h-auto min-h-9 w-full flex-wrap justify-start gap-1 overflow-visible",
        className,
      )}
      {...props}
    />
  );
}
