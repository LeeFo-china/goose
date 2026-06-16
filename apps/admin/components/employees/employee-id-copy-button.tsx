"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getEmployeeIdentityMeta } from "./employee-identity-utils";

export function EmployeeIdCopyButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const identity = getEmployeeIdentityMeta({
    id: employeeId,
    name: employeeName,
  });

  async function copyEmployeeId(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (!employeeId) return;

    try {
      await navigator.clipboard.writeText(employeeId);
      setCopied(true);
      toast.success("已复制员工ID");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动复制员工ID");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover/employee-cell:opacity-100 group-focus-within/employee-cell:opacity-100"
          aria-label={`复制员工ID：${identity.name}`}
          onClick={copyEmployeeId}
        >
          {copied ? (
            <Check className="text-primary" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[320px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-semibold">{identity.name}</div>
          <div className="break-all font-mono text-xs tabular-nums opacity-90">
            {identity.id}
          </div>
          <div className="text-xs opacity-80">
            {copied ? "已复制员工ID" : "点击复制员工ID"}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
