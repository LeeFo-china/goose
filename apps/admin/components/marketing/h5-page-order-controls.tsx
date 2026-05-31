"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_H5_PAGE_API_BASE_PATH, requestH5Page } from "@/components/marketing/h5-page-mutation-shared";

type H5PageOrderAction = "move_up" | "move_down" | "pin_top";

const h5PageOrderActionConfig: Record<H5PageOrderAction, {
  label: string;
  success: string;
  icon: typeof ArrowUp;
}> = {
  move_up: {
    label: "上移",
    success: "已上移一位",
    icon: ArrowUp,
  },
  move_down: {
    label: "下移",
    success: "已下移一位",
    icon: ArrowDown,
  },
  pin_top: {
    label: "置顶",
    success: "已置顶",
    icon: ChevronsUp,
  },
};

export function H5PageOrderControls({
  page,
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
  position,
  total,
}: {
  page: H5MarketingPageRecord;
  apiBasePath?: string;
  position?: number | null;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isSortable = page.status === "published" && Boolean(position);

  function runOrderAction(action: H5PageOrderAction) {
    const config = h5PageOrderActionConfig[action];
    startTransition(async () => {
      try {
        await requestH5Page({
          path: `${apiBasePath}/${page.id}/reorder`,
          method: "POST",
          payload: { action },
        });
        toast.success(config.success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "排序更新失败");
      }
    });
  }

  const actions: Array<{
    action: H5PageOrderAction;
    disabled: boolean;
  }> = [
    {
      action: "pin_top",
      disabled: !isSortable || position === 1,
    },
    {
      action: "move_up",
      disabled: !isSortable || position === 1,
    },
    {
      action: "move_down",
      disabled: !isSortable || position === total,
    },
  ];

  return (
    <div className="flex items-center gap-1">
      {actions.map((item) => {
        const config = h5PageOrderActionConfig[item.action];
        const Icon = config.icon;
        return (
          <Tooltip key={item.action}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={pending || item.disabled}
                  aria-label={config.label}
                  onClick={() => runOrderAction(item.action)}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Icon />}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{config.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
